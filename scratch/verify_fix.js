import { JSDOM } from 'jsdom';
import fs from 'fs';

const html = fs.readFileSync('scratch/test_layout.html', 'utf-8');
const dom = new JSDOM(html, { runScripts: "dangerously" });
const { document } = dom.window;

const labels = Array.from(document.querySelectorAll('.time-slot-label')).map(el => ({
  text: el.textContent
}));

const events = Array.from(document.querySelectorAll('.calendar-event')).map(el => ({
  text: el.textContent,
  top: el.style.top,
  height: el.style.height
}));

console.log("Labels count:", labels.length);
console.log("Events count:", events.length);
console.log("Labels:", labels.map(l => l.text));
console.log("Events:", events);
