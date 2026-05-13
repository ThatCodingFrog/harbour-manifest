//Refactored by Gemini to allow better subdirectory factoring

const fs = require('fs');
const path = require('path');

const PLATFORM_PATTERNS = {
    windows: /.*(win|windows).*\.zip$/i,
    linux: /.*(linux|ubuntu).*\.(zip|AppImage)$/i,
    macos_x64: /.*(mac|macos|osx).*(x64|intel).*\.zip$/i,
    macos_arm64: /.*(mac|macos|osx).*(arm64|aarch64|m1|m2).*\.zip$/i,
    macos_universal: /.*(mac|macos|osx).*(universal|combined).*\.zip$/i,
    macos_generic: /.*(mac|macos|osx).*\.zip$/i
};

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

async function updateGames() {
    const manifestPath = './manifest.json';
    if (!fs.existsSync(manifestPath)) {
        console.error("Could not find manifest.json");
        return;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    // Recursive function to navigate nested ports
    async function processPorts(portObject, currentSubDir = "") {
        for (const [key, value] of Object.entries(portObject)) {
            if (typeof value === 'string') {
                // This is a game file (e.g., "soh.json")
                const gameId = key;
                const fileName = value;
                
                // Build path relative to the "ports" directory
                const relativePath = path.join(currentSubDir, fileName);
                const fullPath = path.resolve("./ports", relativePath);
                
                await updateSingleGame(gameId, fullPath);
            } else if (typeof value === 'object' && value !== null) {
                // This is a category (e.g., "N64"), recurse into it
                // We add the category key to the current subdirectory path
                await processPorts(value, path.join(currentSubDir, key));
            }
        }
    }

    // Start recursion from the root "ports" object
    await processPorts(manifest.ports);
}

async function updateSingleGame(id, fullPath) {
    if (!fs.existsSync(fullPath)) {
        console.warn(`[Skip] File not found for ${id} at: ${fullPath}`);
        return;
    }

    const gameData = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    if (!gameData.repo) return;

    try {
        const res = await fetch(`https://api.github.com/repos/${gameData.repo}/releases/latest`, {
            headers: GITHUB_TOKEN ? { 'Authorization': `token ${GITHUB_TOKEN}` } : {}
        });
        
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const release = await res.json();

        if (release.tag_name !== gameData.version) {
            console.log(`[Update] ${id}: ${gameData.version} -> ${release.tag_name}`);
            gameData.version = release.tag_name;

            let foundAssets = {};
            release.assets.forEach(asset => {
                for (const [platform, regex] of Object.entries(PLATFORM_PATTERNS)) {
                    if (regex.test(asset.name)) {
                        foundAssets[platform] = asset.browser_download_url;
                    }
                }
            });

            if (foundAssets.windows) gameData.downloadUrl.windows = foundAssets.windows;
            if (foundAssets.linux) gameData.downloadUrl.linux = foundAssets.linux;

            const macUrl = foundAssets.macos_universal || foundAssets.macos_generic;
            gameData.downloadUrl.macos_x64 = foundAssets.macos_x64 || macUrl || "";
            gameData.downloadUrl.macos_arm64 = foundAssets.macos_arm64 || macUrl || "";

            fs.writeFileSync(fullPath, JSON.stringify(gameData, null, 4));
        } else {
            console.log(`[OK] ${id} is up to date.`);
        }
    } catch (err) {
        console.error(`[Error] Failed to update ${id}:`, err.message);
    }
}

updateGames();