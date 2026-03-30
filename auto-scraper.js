const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(''); // API KEY here

const ACTIVE_ELEMENTS = [
    'code', 'category-ids', 'description', 'image', 'is-limited',
    'price', 'max-quantity', 'is-product', 'quantity', 'title', 'has-stock',
    'url', 'unavailable'
];

async function cleanHtml(rawHtml) {
    const $ = cheerio.load(rawHtml);
    $('script, style, svg, path, iframe, noscript, nav, footer, header').remove();
    $('*').contents().filter(function() { return this.type === 'comment'; }).remove();
    return $('body').html().replace(/\s+/g, ' ').trim();
}

function extractJson(text) {
    try { return JSON.parse(text); }
    catch (e) {
        const match = text.match(/```json\s*([\s\S]*?)\s*```/);
        return match ? JSON.parse(match[1]) : null;
    }
}

async function main() {
    // UPDATED: Receive Project Path and Vendor Name dynamically
    const targetProjectPath = process.argv[2];
    const vendorName = process.argv[3];

    if (!targetProjectPath || !vendorName) {
        console.log('📝 Usage: node auto-scraper.js <path_to_main_project> <vendor_name>');
        console.log('💡 Example: node auto-scraper.js ../a2b_ext_chrome market-orilab.jp');
        process.exit(1);
    }

    // Resolve the target project path to an absolute path to avoid traversal issues
    const absoluteTargetProjectPath = path.resolve(targetProjectPath);

    console.log(`🚀 EXECUTING (MULTI-CASE) FOR: [${vendorName.toUpperCase()}]`);
    console.log(`📂 Target Project: ${absoluteTargetProjectPath}`);

    const domainName = vendorName.replace('-', '.');

    // Paths relative to the TOOL repository
    const masterPromptPath = path.join(__dirname, 'prompts', 'master-rule.txt');

    // Paths relative to the MAIN PROJECT repository
    const baseScraperPath = path.join(absoluteTargetProjectPath, 'src', 'modules', 'a2b_scraper');
    const sampleDir = path.join(baseScraperPath, 'spec', 'scrapers', 'pc', 'fixtures', domainName);
    const outputDir = path.join(baseScraperPath, 'src', 'scrapers', 'pc', 'vendors', vendorName, 'elements');

    if (!fs.existsSync(sampleDir)) return console.error(`❌ Error: Cannot find HTML sample folder at ${sampleDir}`);
    if (!fs.existsSync(masterPromptPath)) return console.error(`❌ Error: Cannot find master-rule.txt in the tool directory.`);

    // --- READ URL.YML ---
    let caseContexts = {};
    const yamlFilePath = path.join(sampleDir, 'url.yml');

    if (fs.existsSync(yamlFilePath)) {
        console.log(`📖 Found url.yml. Extracting context from comments...`);
        const yamlContent = fs.readFileSync(yamlFilePath, 'utf-8');
        const commentRegex = /#\s*(case\d+)\s*-\s*(.*)/g;
        let match;
        while ((match = commentRegex.exec(yamlContent)) !== null) {
            const fileName = match[1] + '.html';
            const description = match[2].trim();
            caseContexts[fileName] = description;
        }
    } else {
        console.log(`⚠️ url.yml not found. The AI will infer context purely from HTML structure.`);
    }

    const files = fs.readdirSync(sampleDir).filter(f => f.endsWith('.html'));
    let contextHtml = '';

    for (const file of files) {
        const rawHtml = fs.readFileSync(path.join(sampleDir, file), 'utf-8');
        const fileDesc = caseContexts[file] ? ` [CASE DESCRIPTION: ${caseContexts[file]}]` : '';
        contextHtml += `\n--- START FILE: ${file}${fileDesc} ---\n${await cleanHtml(rawHtml)}\n--- END FILE ---\n`;
    }

    // Call Gemini API
    const masterSystemInstruction = fs.readFileSync(masterPromptPath, 'utf-8');
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction: masterSystemInstruction });

    console.log(`🤖 Sending ${files.length} cases to the AI for consolidated analysis...`);
    let parsedData;
    try {
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: `HTML Data:\n${contextHtml}` }] }],
            generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
        });
        parsedData = extractJson(result.response.text());
    } catch (error) {
        return console.error('❌ Error calling Gemini API:', error.message);
    }

    if (!parsedData) return console.error('❌ Error: AI did not return a valid JSON format.');

    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    // --- PROCESS AND INJECT CODE ---
    for (const parser of ACTIVE_ELEMENTS) {
        const elementData = parsedData[parser];

        if (!elementData || (!elementData.selectors && !elementData.parseLogic)) {
            console.log(`⏩ Skipping [${parser}.js]: No specific data required from AI, keeping the original template.`);
            continue;
        }

        // Updated Template Path pointing to the target project
        const templatePath = path.join(baseScraperPath, 'gulpfile.babel.js', 'templates', 'base_module', 'pc', 'example.com', 'elements', `${parser}.js`);
        if (!fs.existsSync(templatePath)) {
            console.error(`⚠️ Skipping [${parser}.js]: Template file not found at ${templatePath}`);
            continue;
        }

        let templateContent = fs.readFileSync(templatePath, 'utf-8');

        // INJECT MAIN SELECTORS ARRAY AND EXTRA CONSTRUCTOR (IF ANY)
        if (templateContent.includes('this.SELECTORS')) {
            const selectorsInject = elementData.selectors.map(s => `      '${s.replace(/'/g, '"')}',`).join('\n');
            const extraConstructorCode = elementData.extraConstructor ? `\n\n    ${elementData.extraConstructor}` : '';
            templateContent = templateContent.replace(
                /this\.SELECTORS\s*=\s*\[\s*('',?\s*)*\];/g,
                `this.SELECTORS = [\n${selectorsInject}\n    ];${extraConstructorCode}`
            );
        }

        // INJECT PARSE LOGIC
        if (parser === 'unavailable' && elementData) {
            if (elementData.imports) {
                templateContent = templateContent.replace(
                    /import\s+{.*}\s+from\s+'\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/util\/status_code';/,
                    `import {${elementData.imports}} from '../../../../../util/status_code';`
                );
            }
            if (elementData.extraConstructor) {
                templateContent = templateContent.replace(/(super\(\$\);\s*)/, `$1\n    ${elementData.extraConstructor}\n`);
            }
            if (elementData.parseLogic) {
                templateContent = templateContent.replace(
                    /parse\(\)\s*{[\s\S]*?return\s+AVAILABLE;\s*}/,
                    `parse() {\n    ${elementData.parseLogic}\n  }`
                );
            }
            if (elementData.extraMethods) {
                templateContent = templateContent.replace(/}\s*$/g, `\n  ${elementData.extraMethods}\n}`);
            }
        }
        else if (elementData.parseLogic && parser !== 'description') {
            if (parser === 'url') {
                templateContent = templateContent.replace(/return this\.\$\.location\.href;/g, elementData.parseLogic);
            } else {
                const defaultReturnRegex = /return\s+(false|element\.textContent\.trim\(\)|element\.src|toNumber\(element\.textContent\)|element\.value|!!this\.\$\.querySelector\(this\.selectors\(\)\)|element\.options\[element\.options\.length\s*-\s*1\]\.value);/g;
                templateContent = templateContent.replace(defaultReturnRegex, elementData.parseLogic);
            }
        }

        const filePath = path.join(outputDir, `${parser}.js`);
        fs.writeFileSync(filePath, templateContent, 'utf-8');
        console.log(`✅ Successfully rendered: ${parser}.js`);
    }

    console.log(`\n🎉 SUCCESS! THE SYSTEM HAS COVERED ALL CASES.`);
}

main();
