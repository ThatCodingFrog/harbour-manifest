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
    // 1. Get the absolute path to the directory where update.js lives
    const rootDir = __dirname; 
    const manifestPath = path.join(rootDir, 'manifest.json');

    if (!fs.existsSync(manifestPath)) {
        console.error("Could not find manifest.json at: " + manifestPath);
        return;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    async function processPorts(portObject, currentSubDir = "") {
        for (const [key, value] of Object.entries(portObject)) {
            if (typeof value === 'string') {
                const gameId = key;
                const fileName = value;
                
                // 2. Build the absolute path starting from the root directory
                // This points to [YourRepo]/ports/[SubDir]/[filename.json]
                const fullPath = path.join(rootDir, "ports", currentSubDir, fileName);
                
                await updateSingleGame(gameId, fullPath);
            } else if (typeof value === 'object' && value !== null) {
                await processPorts(value, path.join(currentSubDir, key));
            }
        }
    }

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