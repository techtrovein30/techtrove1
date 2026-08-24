const fs = require('fs');

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
    if (!file.endsWith('.tsx') && !file.endsWith('.ts') && !file.endsWith('.css')) return;
    
    let content = fs.readFileSync(file, 'utf8');
    let changed = false;

    const replace = (regex, replacement) => {
        if (content.match(regex)) {
            content = content.replace(regex, replacement);
            changed = true;
        }
    };

    replace(/#7c3aed/gi, '#d4af37'); // primary
    replace(/#8b5cf6/gi, '#fde047'); // primary-soft
    replace(/#4c1d95/gi, '#854d0e'); // primary-deep
    replace(/#c4b5fd/gi, '#fef08a'); // light
    replace(/124,\s*58,\s*237/g, '212, 175, 55'); // rgba
    replace(/glow-purple/g, 'glow-gold');

    if (changed) {
        fs.writeFileSync(file, content);
        console.log(`Updated ${file}`);
    }
});
