import fs from 'fs';

const ALLOWED = new Set([
  'MIT', 'Apache-2.0', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause',
  'CC0-1.0', 'Unlicense', 'BlueOak-1.0.0', '0BSD',
  'Zlib', 'Unicode-3.0', 'Apache-2.0 WITH LLVM-exception'
]);

const WARNINGS = new Set([
  'CC-BY-4.0', 'CC-BY-3.0'
]);

let sbomPath = 'sbom-full.json';
let exceptionsPath = 'scripts/license-exceptions.json';

if (!fs.existsSync(sbomPath)) {
  console.error(`SBOM file not found: ${sbomPath}`);
  process.exit(1);
}

const sbom = JSON.parse(fs.readFileSync(sbomPath, 'utf8'));
const exceptionsConfig = fs.existsSync(exceptionsPath) ? JSON.parse(fs.readFileSync(exceptionsPath, 'utf8')) : { exceptions: [] };

let hasErrors = false;
let hasWarnings = false;

const isException = (name, version, licenseId) => {
  return exceptionsConfig.exceptions.some(ex => 
    ex.name === name && 
    (!ex.version || ex.version === version) && 
    (!ex.license || ex.license === licenseId)
  );
};

const isAllowedLicense = (lic) => {
  if (!lic) return false;
  lic = lic.replace(/[()]/g, '');
  if (lic.includes(' AND ')) {
    return lic.split(' AND ').every(part => isAllowedLicense(part.trim()));
  }
  if (lic.includes(' OR ')) {
    return lic.split(' OR ').some(part => isAllowedLicense(part.trim()));
  }
  return ALLOWED.has(lic) || WARNINGS.has(lic);
};

for (const component of sbom.components || []) {
  const name = component.name;
  const version = component.version;
  
  if (!component.licenses || component.licenses.length === 0) {
    if (name.startsWith('stellar-trust-') || name.startsWith('escrow_')) {
      continue;
    }
    if (isException(name, version, 'UNLICENSED')) {
      console.log(`[ALLOWED BY EXCEPTION] ${name}@${version} - UNLICENSED`);
    } else {
      console.error(`[ERROR] Missing license for component: ${name}@${version}`);
      hasErrors = true;
    }
    continue;
  }

  for (const licObj of component.licenses) {
    const license = licObj.license || licObj.expression;
    if (!license) continue;
    
    let licenseId = license.id || license.name || license;
    
    // Check if valid via OR/AND logic
    if (isAllowedLicense(licenseId)) {
      continue;
    } else {
      if (isException(name, version, licenseId)) {
        console.log(`[ALLOWED BY EXCEPTION] ${name}@${version} - ${licenseId}`);
      } else {
        console.error(`[ERROR] Unallowed license: ${licenseId} in component: ${name}@${version}`);
        hasErrors = true;
      }
    }
  }
}

if (hasErrors) {
  console.error('\nLicense compliance check FAILED.');
  process.exit(1);
} else {
  if (hasWarnings) {
    console.log('\nLicense compliance check PASSED with WARNINGS.');
  } else {
    console.log('\nLicense compliance check PASSED.');
  }
  process.exit(0);
}
