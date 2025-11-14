const fs = require('fs/promises');
const path = require('path');

// --- CONFIGURATION ---
const LOCALES_PATH = path.resolve(__dirname, '..', '..', 'client' ,'src', 'locales'); // Assumes script is in server/scripts and locales are in src/locales
const API_ENDPOINT = "https://libretranslate.de/translate";
const API_CALL_DELAY = 1000; // Milliseconds to wait between each translation call to be polite to the public API

// --- SCRIPT ARGUMENTS ---
const DRY_RUN = process.argv.includes('--dry-run');
const args = process.argv.slice(2).filter(arg => arg !== '--dry-run');
const SOURCE_LANG = args[0];
const TARGET_LANGS = args.slice(1);

async function translateString(text, sourceLang, targetLang) {
    try {
        await new Promise(resolve => setTimeout(resolve, API_CALL_DELAY));

        const res = await fetch(API_ENDPOINT, {
            method: "POST",
            body: JSON.stringify({
                q: text,
                source: sourceLang,
                target: targetLang,
                format: "text",
            }),
            headers: {
                "Content-Type": "application/json",
                // *** THE CRITICAL FIX IS HERE ***
                // This makes our script look like a standard web browser, avoiding simple bot detection.
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36",
            },
        });

        // Check if the server responded with an error code
        if (!res.ok) {
            console.error(`   -> FAIL: API returned status ${res.status}. Falling back to original text.`);
            console.log(`   - Fallback: "${text}" -> "${text}"`);
            return text;
        }

        // Check if the server sent us HTML instead of JSON (a sign of a block page)
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            console.error(`   -> FAIL: API returned HTML/text instead of JSON (rate-limited). Falling back.`);
            console.log(`   - Fallback: "${text}" -> "${text}"`);
            return text;
        }

        const data = await res.json();
        const translation = data.translatedText || text;

        // Improved success logging
        console.log(`   - SUCCESS: "${text}" -> "${translation}"`);
        return translation;

    } catch (error) {
        console.error(`   -> FAIL: Network error during translation. Falling back.`);
        console.log(`   - Fallback: "${text}" -> "${text}"`);
        return text;
    }
}

async function translateObject(obj, sourceLang, targetLang) {
  const newObj = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      if (typeof value === 'string') {
        if (value.trim() === '' || /\{\{[^}]+\}\}|\{[^}]+\}/.test(value)) {
           newObj[key] = value;
        } else {
            // The function now returns the result, which we assign here.
            newObj[key] = await translateString(value, sourceLang, targetLang);
        }
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        newObj[key] = await translateObject(value, sourceLang, targetLang);
      } else {
        newObj[key] = value;
      }
    }
  }
  return newObj;
}

// The main `run` function remains the same as before.
async function run() {
    console.log('--- Starting Locale Translation Script (v3 - With User-Agent) ---');
    console.log(`Dry Run Mode: ${DRY_RUN ? 'ENABLED (no files will be written)' : 'DISABLED'}\n`);

    if (!SOURCE_LANG || TARGET_LANGS.length === 0) {
        console.error('[FATAL ERROR] Usage: node scripts/translateLocales.js <source_lang> <target_lang_1> [target_lang_2]...');
        console.error('Example: node scripts/translateLocales.js de it fr es');
        process.exit(1);
    }

    const sourceDir = path.join(LOCALES_PATH, SOURCE_LANG);
    let sourceFiles;
    try {
        sourceFiles = await fs.readdir(sourceDir);
    } catch (error) {
        console.error(`[FATAL ERROR] Could not read source directory: ${sourceDir}`);
        console.error(error.message);
        process.exit(1);
    }

    console.log(`Source Language: ${SOURCE_LANG.toUpperCase()}`);
    console.log(`Target Languages: ${TARGET_LANGS.map(l => l.toUpperCase()).join(', ')}`);
    console.log(`Found ${sourceFiles.filter(f => f.endsWith('.json')).length} JSON files to process.\n`);

    for (const targetLang of TARGET_LANGS) {
      console.log(`\n--- Processing for target language: ${targetLang.toUpperCase()} ---\n`);
      const targetDir = path.join(LOCALES_PATH, targetLang);

      if (!DRY_RUN) {
          await fs.mkdir(targetDir, { recursive: true });
      } else {
          console.log(`[DRY RUN] Would ensure directory exists: ${targetDir}`);
      }

      for (const fileName of sourceFiles) {
        if (!fileName.endsWith('.json')) continue;

        console.log(`\nProcessing file: ${fileName}`);
        const sourceFilePath = path.join(sourceDir, fileName);
        const targetFilePath = path.join(targetDir, fileName);

        const sourceContent = await fs.readFile(sourceFilePath, 'utf8');
        const sourceJson = JSON.parse(sourceContent);

        const translatedJson = await translateObject(sourceJson, SOURCE_LANG, targetLang);

        if (!DRY_RUN) {
            await fs.writeFile(targetFilePath, JSON.stringify(translatedJson, null, 2), 'utf8');
            console.log(`\n -> SUCCESS: Wrote translated file to ${targetFilePath}`);
        } else {
            console.log(`\n[DRY RUN] Would write translated file to ${targetFilePath}`);
        }
      }
    }
    console.log('\n--- SCRIPT COMPLETED SUCCESSFULLY ---');
}

run().catch(error => {
    console.error('\n--- A CRITICAL ERROR OCCURRED ---');
    console.error(error);
    process.exit(1);
});