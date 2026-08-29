import { execSync } from 'child_process';
import fs from 'fs';

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

// We can inject JS script to print bounding rects of timetable grid elements!
const jsToRun = `
  const grid = document.getElementById('timetable-grid');
  const labels = Array.from(document.querySelectorAll('.time-slot-label')).map(el => ({
    text: el.textContent,
    top: el.offsetTop,
    height: el.offsetHeight
  }));
  const events = Array.from(document.querySelectorAll('.calendar-event')).map(el => ({
    text: el.innerText.replace(/\\n/g, ' '),
    top: el.offsetTop,
    height: el.offsetHeight,
    computedTop: getComputedStyle(el).top
  }));
  console.log(JSON.stringify({ labels: labels.slice(0, 5), events: events.slice(0, 5) }, null, 2));
`;

// Let's create a temporary node script using puppeteer or playwright if available, or fetch
console.log("Running layout inspection...");
