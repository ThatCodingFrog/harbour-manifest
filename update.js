// Refactored by Gemini to support both GitHub and GitLab releases

const fs = require('fs');
const path = require('path');

// Removed strict \.zip$ requirement so extension-less link names (e.g. GitLab/Pixeldrain) can match
const PLATFORM_PATTERNS = {
    windows: /.*(win|windows).*/i,
    linux: /.*(linux|ubuntu).*/i,
    macos_x64: /.*(mac|macos|osx).*(x64|intel).*/i,
    macos_arm64: /.*(mac|macos|osx).*(arm64|aarch64|m1|m2).*/i,
    macos_universal: /.*(mac|macos|osx).*(universal|combined).*/i,
    macos_generic: /.*(mac|macos|osx).*/i
};

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITLAB_TOKEN = process.env.GITLAB_TOKEN;

async function updateGames() {
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
                const fullPath = path.join(rootDir, "ports", currentSubDir, fileName);

                await updateSingleGame(gameId, fullPath);
            } else if (typeof value === 'object' && value !== null) {
                await processPorts(value, path.join(currentSubDir, key));
            }
        }
    }

    await processPorts(manifest.ports);
}

async function fetchLatestRelease(provider, repo) {
    let apiUrl = '';
    let headers = {};

    if (provider === 'gitlab') {
        const encodedRepo = encodeURIComponent(repo);
        apiUrl = `https://gitlab.com/api/v4/projects/${encodedRepo}/releases/permalink/latest`;
        if (GITLAB_TOKEN) {
            headers['PRIVATE-TOKEN'] = GITLAB_TOKEN;
        }
    } else {
        apiUrl = `https://api.github.com/repos/${repo}/releases/latest`;
        if (GITHUB_TOKEN) {
            headers['Authorization'] = `token ${GITHUB_TOKEN}`;
        }
    }

    const res = await fetch(apiUrl, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status} (${provider})`);

    const data = await res.json();
    let normalizedAssets = [];

    if (provider === 'gitlab') {
        const assets = data.assets || {};

        // 1. Process explicit release links
        const links = assets.links || [];
        links.forEach(link => {
            const downloadUrl = link.direct_asset_url || link.url;
            let urlFileName = downloadUrl;

            try {
                urlFileName = path.basename(new URL(downloadUrl).pathname);
            } catch (e) {
                // Fallback if URL parsing fails
            }

            normalizedAssets.push({
                name: link.name || urlFileName,
                urlName: urlFileName,
                url: downloadUrl
            });
        });

        // 2. Process source code archives if present
        const sources = assets.sources || [];
        sources.forEach(source => {
            if (source.url) {
                let urlFileName = source.url;
                try {
                    urlFileName = path.basename(new URL(source.url).pathname);
                } catch (e) { }

                normalizedAssets.push({
                    name: `${data.tag_name}.${source.format}`,
                    urlName: urlFileName,
                    url: source.url
                });
            }
        });
    } else {
        const assets = data.assets || [];
        normalizedAssets = assets.map(asset => ({
            name: asset.name,
            urlName: asset.name,
            url: asset.browser_download_url
        }));
    }

    return {
        tag_name: data.tag_name,
        assets: normalizedAssets
    };
}

async function updateSingleGame(id, fullPath) {
    if (!fs.existsSync(fullPath)) {
        console.warn(`[Skip] File not found for ${id} at: ${fullPath}`);
        return;
    }

    const gameData = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    if (!gameData.repo) return;

    const provider = (gameData.provider || 'github').toLowerCase();

    try {
        const release = await fetchLatestRelease(provider, gameData.repo);

        if (release.tag_name !== gameData.version) {
            console.log(`[Update] ${id} (${provider}): ${gameData.version} -> ${release.tag_name}`);
            gameData.version = release.tag_name;

            let foundAssets = {};
            release.assets.forEach(asset => {
                // Optional: Ignore 'Lite' releases if present
                if (asset.name.includes("-Lite-")) return;

                for (const [platform, regex] of Object.entries(PLATFORM_PATTERNS)) {
                    if (regex.test(asset.name) || regex.test(asset.urlName)) {
                        foundAssets[platform] = asset.url;
                    }
                }
            });

            if (!gameData.downloadUrl) gameData.downloadUrl = {};

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