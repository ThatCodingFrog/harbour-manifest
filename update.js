const fs = require('fs');
const path = require('path');

const PLATFORM_PATTERNS = {
    windows: /.*(win|windows).*64.*\.zip$/i,
    linux: /.*(linux|ubuntu).*\.zip$/i,
    macos_x64: /.*(mac|macos|osx).*(x64|intel).*\.zip$/i,
    macos_arm64: /.*(mac|macos|osx).*(arm64|aarch64|m1|m2).*\.zip$/i,
    macos_universal: /.*(mac|macos|osx).*(universal|combined).*\.zip$/i,
    macos_generic: /.*(mac|macos|osx).*\.zip$/i // Fallback for "Ship-Mac.zip"
};

async function updateGames() {
    const manifest = JSON.parse(fs.readFileSync('./manifest.json', 'utf8'));
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

    for (const [id, filePath] of Object.entries(manifest)) {
        const fullPath = path.resolve(filePath);
        const gameData = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        if (!gameData.repo) continue;

        try {
            const res = await fetch(`https://api.github.com/repos/${gameData.repo}/releases/latest`, {
                headers: GITHUB_TOKEN ? { 'Authorization': `token ${GITHUB_TOKEN}` } : {}
            });
            const release = await res.json();

            if (release.tag_name !== gameData.version) {
                console.log(`Updating ${id} to ${release.tag_name}`);
                gameData.version = release.tag_name;

                // Temporary storage to find the best Mac match
                let foundAssets = {};

                release.assets.forEach(asset => {
                    for (const [platform, regex] of Object.entries(PLATFORM_PATTERNS)) {
                        if (regex.test(asset.name)) {
                            foundAssets[platform] = asset.browser_download_url;
                        }
                    }
                });

                // --- MacOS Logic ---
                // 1. Assign specific builds if found
                if (foundAssets.windows) gameData.downloadUrl.windows = foundAssets.windows;
                if (foundAssets.linux) gameData.downloadUrl.linux = foundAssets.linux;
                
                // 2. Resolve Mac: Specific > Universal > Generic
                const macUrl = foundAssets.macos_universal || foundAssets.macos_generic;
                
                gameData.downloadUrl.macos_x64 = foundAssets.macos_x64 || macUrl || "";
                gameData.downloadUrl.macos_arm64 = foundAssets.macos_arm64 || macUrl || "";

                fs.writeFileSync(fullPath, JSON.stringify(gameData, null, 4));
            }
        } catch (err) {
            console.error(`Error processing ${id}:`, err);
        }
    }
}

updateGames();