const fs = require('fs');
const path = require('path');

function normalizeStepDescription(description) {
    return description.trim().replace(/"/g, "'");
}

function extractStepsFromTS(tsFilePath) {
    const tsContent = fs.readFileSync(tsFilePath, 'utf-8');

    const stepPattern = /(Given|When|Then)\(["'](.+?)["'](?:, (?:async )?\(([^)]*?)\))?:/g;

    const steps = [];
    let match;
    while ((match = stepPattern.exec(tsContent)) !== null) {
        const stepType = match[1];
        const stepDescription = match[2];
        const parameters = match[3] || '';
        steps.push({ type: stepType, description: normalizeStepDescription(stepDescription), parameters });
    }

    return steps;
}

function transformFeatureToTS(featureFilePath, stepsDirectory) {
    const featureContent = fs.readFileSync(featureFilePath, 'utf-8');
    const lines = featureContent.split(/\r?\n/);
    const featureSteps = [];
    const BackgroundPattern = /^\s*Background:.*/;
    const scenarioPattern = /^\s*Scenario:.*/;
    const stepPattern = /^\s*(Given|When|Then|And|But)\s(.*)/;
    let insideScenario = false;
    let previousStepType = '';

    lines.forEach(line => {
        if (scenarioPattern.test(line) || BackgroundPattern.test(line)) {
            insideScenario = true;
        } else if (insideScenario && stepPattern.test(line)) {
            const match = line.match(stepPattern);
            let stepType = match[1];
            let stepDescription = match[2];

            if (stepType === 'And') {
                stepType = previousStepType;
            }

            stepDescription = stepDescription.replace(/("[^"]+"|<[^>]+>)/g, '{string}');
            featureSteps.push({ type: stepType, description: normalizeStepDescription(stepDescription) });

            previousStepType = stepType;
        } else if (line.trim() === '') {
            insideScenario = false;
            previousStepType = '';
        }
    });

    const baseName = path.basename(featureFilePath, '.feature');
    const stepsParentDirectory = path.resolve(stepsDirectory, '..'); // Get the parent directory of stepsDirectory
    const tsFile = path.join(stepsParentDirectory, 'steps', `${baseName}.ts`); // Create path to the steps directory relative to the feature directory
    const existingSteps = fs.existsSync(tsFile) ? extractStepsFromTS(tsFile) : [];
    const allSteps = existingSteps.map(step => `${step.type}:${step.description}`);

    const missingSteps = featureSteps.filter(featureStep => {
        const featureStepKey = `${featureStep.type}:${featureStep.description}`;
        return !allSteps.includes(featureStepKey);
    });

    if (missingSteps.length > 0) {
        let missingStepDefinitions = '';
        if (!fs.existsSync(tsFile)) {
            // Create the file and add import statement if it doesn't exist
            missingStepDefinitions += `import { When, Then, Given } from "@cucumber/cucumber";\n\n`;
        }
        missingStepDefinitions += missingSteps.map(step => {
            const parameters = step.parameters ? `(${step.parameters})` : '';
            return `${step.type}("${step.description}", async (${step.parameters}): Promise<void> => {\n  // Implement your step here\n});\n\n`;
        }).join('');
        fs.writeFileSync(tsFile, missingStepDefinitions, { flag: 'a+' });
        console.log(`Added missing steps to ${tsFile}`);
    } else {
        console.log(`No missing steps found for ${baseName}.ts`);
    }
}

// Usage: node transform-feature.js <featureFileName>
const args = process.argv.slice(2);
if (args.length < 1) {
    console.error('Usage: node transform-feature.js <featureFileName>');
    process.exit(1);
}

const featureFileName = args[0];
const featuresDirectory = path.join(__dirname, '..', 'features');
const stepsDirectory = path.join(__dirname, '..', 'steps');

if (!fs.existsSync(featuresDirectory)) {
    console.error(`Error: Features directory '${featuresDirectory}' not found.`);
    process.exit(1);
}

if (!fs.existsSync(stepsDirectory)) {
    fs.mkdirSync(stepsDirectory, { recursive: true });
}

const featureFilePath = path.join(featuresDirectory, featureFileName);

if (!fs.existsSync(featureFilePath)) {
    console.error(`Error: Feature file '${featureFileName}' not found.`);
    process.exit(1);
}

transformFeatureToTS(featureFilePath, stepsDirectory);
