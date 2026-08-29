import fs from 'fs';
import { JSDOM } from 'jsdom';

fetch('http://localhost:5173')
  .then(res => res.text())
  .then(html => {
    console.log("Fetched HTML length:", html.length);
  })
  .catch(err => console.error(err));
