import fs from 'fs';

// Let's inspect the exact CSS in style.css and main.js layout logic
const cssContent = fs.readFileSync('src/style.css', 'utf-8');
const mainJsContent = fs.readFileSync('src/main.js', 'utf-8');

console.log("Checking grid-template-rows in style.css...");
console.log("timetable-grid mentions:", cssContent.match(/\.timetable-grid\s*\{[^}]*\}/g));
