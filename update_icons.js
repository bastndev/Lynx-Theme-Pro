const fs = require('fs');
const path = require('path');

const dir = './src/assets/svg/gray';
const files = fs.readdirSync(dir).filter(f => f.endsWith('_dark.svg'));

const NEW_FILL = '#D4EAD8'; 
const NEW_OPACITY = '0.45';

files.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/fill-opacity="[^"]*"/g, `fill-opacity="${NEW_OPACITY}"`);
  content = content.replace(/fill="#[^"]*"/g, `fill="${NEW_FILL}"`);
  fs.writeFileSync(filePath, content);
});
console.log('Icons updated successfully');
