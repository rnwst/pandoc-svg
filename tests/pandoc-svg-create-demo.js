#!/usr/bin/env node

/**
 * Command line utility to create an animated demo showing an SVG before and
 * after transformation by pandoc-svg, for use in the README.
 *
 * Usage (after installing or running `npm link`):
 * pandoc-svg-demo input-file.svg output-file.svg
 *
 * Unfortunately, math equations don't currently work. See
 * https://github.com/mathjax/MathJax-demos-node/issues/54.
 */

'use strict';

import * as utils from '../lib/utils.js';
import text2foreignObject from '../lib/text2foreignObject.js';
import svg2to11 from '../lib/svg2to11.js';
import {main as optimize} from '../lib/optimize.js';
import * as fs from 'fs';
// import * as mathjax from 'mathjax-full';

/**
 * Convert math to SVG using MathJax.
 * @param {object} foreignObject - DOM node containing math to be converted
 */
/*
async function math2svg(foreignObject) {
  await mathjax.init({
    startup: {
      document: foreignObject.innerHTML,
    },
  }).then( (MathJax) => {
    const adaptor = MathJax.startup.adaptor;
    const html = MathJax.startup.document;
    foreignObject.innerHTML = adaptor.outerHTML(adaptor.root(html.document));
  }).catch((err) => console.error(err));
};
*/

/**
 * Main function.
 */
async function main() {
  // Process arguments.
  // First argument is  process.argv[2]` (`process.argv.slice(0,2)` are
  // locations of node and the script).
  const firstArg = process.argv.length > 2 ? process.argv[2] : '';
  const usage = 'Usage:\n' +
                'pandoc-svg-demo input-file.svg [output-file.svg]';
  if (firstArg === '') {
    console.error('No input file was provided!\n');
    console.error(usage);
    console.error('\nExiting.');
    return;
  } else if (firstArg === '--help') {
    console.log(usage);
    return;
  }
  const inputFile = firstArg;
  const outputFile = process.argv.length > 3 ? process.argv[3] : '';

  // Load input file.
  const svgString = utils.loadSVG(inputFile);
  if (!svgString) {
    console.error('Exiting.');
    return;
  }

  // Create DOM from input file.
  const svgDOM = utils.createDOM(svgString);
  optimize({svgDOM});
  svg2to11(svgDOM);

  // Create animated SVG DOM.
  const animatedSVGDom = utils.createDOM(utils.serialize(svgDOM));
  animatedSVGDom.querySelector('svg').innerHTML = '';

  // Add `<defs>` tag to animated SVG.
  const defs = [...svgDOM.querySelector('svg').childNodes].filter( (node) => {
    return node.tagName === 'defs';
  })?.[0];
  if (defs) {
    animatedSVGDom.querySelector('svg').appendChild(defs);
  }

  // Create layers for old and new SVGs.
  const layerOld =
      animatedSVGDom.createElementNS('http://www.w3.org/2000/svg', 'g');
  const layerNew =
      animatedSVGDom.createElementNS('http://www.w3.org/2000/svg', 'g');
  animatedSVGDom.querySelector('svg').appendChild(layerOld);
  animatedSVGDom.querySelector('svg').appendChild(layerNew);

  // Add `<animate>` tags to animated SVG.
  const animateTag =
    '<animate attributeName="opacity" dur="2s" from="0" ' +
    'keyTimes="0;0.5;0.5;1" repeatCount="indefinite" to="1" values="0;0;1;1"/>';
  layerOld.innerHTML += animateTag;
  // Second animate tag is like first one but with attribute `begin="1s"` to
  // delay the animation by 1 second.
  layerNew.innerHTML += animateTag;
  layerNew.children[0].setAttribute('begin', '1s');

  // Function to add content of SVG (excluding `<defs>` element) to animated
  // SVG.
  const svgContent = (svgDOM) => {
    return [...svgDOM.querySelector('svg').childNodes].map( (node) => {
      return node.tagName !== 'defs' ? node.outerHTML : '';
    }).join('');
  };

  // Add contents of old SVG to animated SVG.
  layerOld.innerHTML += svgContent(svgDOM);

  // Transform SVG.
  text2foreignObject(svgDOM);

  // Add content of transformed SVG to animated SVG.
  layerNew.innerHTML += svgContent(svgDOM);

  // Transform math using MathJax, as GitHub READMEs cannot contain Javascript.
  // This doesn't currently work!
  animatedSVGDom.querySelectorAll('foreignObject').forEach( (foreignObject) => {
    // math2svg(foreignObject);
  });

  // When the SVG is not inlined and loaded via an `<img>` element, proper
  // namespaces need to be set for the elements inside of `<foreignObject>`s.
  // See
  // https://github.com/sindresorhus/css-in-readme-like-wat/blob/main/readme.md.
  // Unfortunately, utils.serialize does not include the relevant XHTML
  // namespaces. As a workaround, a placeholder is inserted and later replaced
  // with the correct namespace.
  const foreignObjects = animatedSVGDom.querySelectorAll('foreignObject');
  for (const foreignObject of foreignObjects) {
    foreignObject.innerHTML =
      '<div namespace-placeholder="empty">' +
      foreignObject.innerHTML +
      '</div>';
  }

  // Write anmated SVG either to stdout or to file.
  let animatedSVGString = utils.serialize(animatedSVGDom);
  animatedSVGString = animatedSVGString.replaceAll(
      /namespace-placeholder="empty"/ig,
      'xmlns="http://www.w3.org/1999/xhtml"');
  if (!outputFile) {
    process.stdout.write(animatedSVGString);
  } else {
    fs.writeFileSync(outputFile, animatedSVGString);
    console.log(`Saved animated SVG as '${outputFile}'.`);
  }
}


main();
