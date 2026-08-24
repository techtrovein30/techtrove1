const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = dir + '/' + file;
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walk(file));
        } else { 
            results.push(file);
        }
    });
    return results;
}

const files = walk('c:/Users/sasva/Downloads/techtrove1/src');
files.forEach(file => {
    if (!file.endsWith('.tsx') && !file.endsWith('.ts')) return;
    let content = fs.readFileSync(file, 'utf8');
    // Replace TechTrove with TechTrove 3.0, but avoid double replacing if it's already TechTrove 3.0
    if (content.match(/TechTrove(?!\s*3\.0)/g)) {
        content = content.replace(/TechTrove(?!\s*3\.0)/g, 'TechTrove 3.0');
        fs.writeFileSync(file, content);
        console.log(`Updated ${file}`);
    }
});
