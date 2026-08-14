const fs = require('fs');
const path = require('path');

// Since this script is top-level, rootDir IS __dirname!
const rootDir = __dirname;
const portsDir = path.join(rootDir, 'ports');
const manifestTemplatePath = path.join(rootDir, 'manifest.json');
const outputFile = path.join(rootDir, 'manifest-bundled.json');

function bundleManifest() {
    console.log('Starting manifest bundling...');

    if (!fs.existsSync(manifestTemplatePath)) {
        console.error(`[Error] Could not find manifest.json at: ${manifestTemplatePath}`);
        return;
    }

    const baseManifest = JSON.parse(fs.readFileSync(manifestTemplatePath, 'utf8'));

    function resolvePortTree(node, currentSubDir = "") {
        const resolvedNode = {};

        for (const [key, value] of Object.entries(node)) {
            //Skip harbour entry -- handled elsewhere
            if (key === 'harbour' || value === 'harbour.json') {
                console.log(`  - Skipping self-update entry: ${key}`);
                continue; // Pass on embedding it in manifest-bundled.json
            }

            if (typeof value === 'string') {
                // Check subfolder path first (e.g. ports/GB/ladxhd.json)
                let filePath = path.join(portsDir, currentSubDir, value);

                // Fallback to root /ports/ if it's an exception (e.g. ports/harbour.json)
                if (!fs.existsSync(filePath)) {
                    filePath = path.join(portsDir, value);
                }

                if (fs.existsSync(filePath)) {
                    try {
                        const portData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                        resolvedNode[key] = portData;
                        console.log(`  + Embedded: ${key} <- (${path.relative(portsDir, filePath)})`);
                    } catch (err) {
                        console.error(`  x Error parsing JSON at ${filePath}:`, err.message);
                        resolvedNode[key] = value;
                    }
                } else {
                    console.warn(`  ! File not found for '${key}': Checked '${filePath}'`);
                    resolvedNode[key] = value;
                }
            } else if (typeof value === 'object' && value !== null) {
                // Recurse into categories (GB, N64, GC, etc.)
                resolvedNode[key] = resolvePortTree(value, path.join(currentSubDir, key));
            } else {
                resolvedNode[key] = value;
            }
        }

        return resolvedNode;
    }

    const bundledPorts = resolvePortTree(baseManifest.ports);

    const finalManifest = {
        baseURL: baseManifest.baseURL,
        generated_at: new Date().toISOString(),
        ports: bundledPorts
    };

    fs.writeFileSync(outputFile, JSON.stringify(finalManifest, null, 2));
    console.log(`\n[SUCCESS] Bundled manifest saved to: ${outputFile}`);
}

bundleManifest();