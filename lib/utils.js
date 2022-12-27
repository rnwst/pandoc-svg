'use strict';

import * as fs from 'fs';
import {JSDOM} from 'jsdom';
import html5attrs from './html5attrs.js';
import {execSync} from 'child_process';
import {sync as commandExists} from 'command-exists';

/**
 * Flag to be set when output format error has been printed.
 * @type {boolean}
 */
let printedOutputFormatErrorMsg = false;

/**
 * Check if output format passed by pandoc is compatible.
 * @param {string} format - Output format
 * @return {boolean} - Whether output format is valid
 */
export function compatibleOutputFormat(format) {
  const formats = new Set(['html']);
  if (formats.has(format)) {
    return true;
  }
  if (!printedOutputFormatErrorMsg) {
    console.error('pandoc-svg: Output format must be ' +
                  `${[...formats].slice(0, -1).join(', ')}, or ` +
                  `${[...formats].pop()}. ` +
                  `Format '${format}' is not supported. Aborting.`);
    printedOutputFormatErrorMsg = true;
  }
  return false;
}

/**
 * Check if AST element is a figure.
 * Pandoc considers an Image whose title attribute starts with 'fig:' a figure.
 * See https://github.com/jgm/pandoc/issues/3177. A figure is the only element
 * in the containing paragraph.
 * @param {string} key - Element key
 * @param {object} value - Element contents
 * @return {boolean} - Whether AST element is a figure
 */
export function isFigure(key, value) {
  if ( key === 'Para' &&
       value[0]['t'] === 'Image' &&
       value[0]['c'][2][1]?.startsWith('fig:') ) {
    return true;
  }
  return false;
}

/**
 * Check if AST element is an image.
 * @param {string} key - Element key
 * @return {boolean} - Whether AST element is an image
 */
export function isImage(key) {
  return (key === 'Image');
}

/**
 * Check if file is an SVG.
 * @param {string} fname - File path
 * @return {boolean} - Whether file is an SVG
 */
export function isSVG(fname) {
  return Boolean(/.*\.(?:svg|SVG)$/.exec(fname));
}

/**
 * Set containing all files that haven't been found. This is needed to ensure
 * corresponding error messages are only printed once.
 * @type {object}
 */
const filesNotFound = new Set();

/**
 * Load SVG file.
 * @param {string} path - Path to SVG file
 * @return {string} - SVG file contents
 */
export function loadSVG(path) {
  let svgString;
  try {
    svgString = fs.readFileSync(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      if (!filesNotFound.has(path)) {
        console.error(`pandoc-svg: File ${path} could not be found!`);
      }
      filesNotFound.add(path);
      return null;
    } else {
      throw error;
    }
  }
  return svgString;
}

/**
 * Create a DOM from the SVG.
 * @param {string} svgString - SVG contents
 * @return {object} - SVG DOM
 */
export function createDOM(svgString) {
  // The SVG is parsed as 'text/html' instead of 'text/xml'. This is because the
  // SVG might contain `<foreignObject>` elements, which contain HTML, which the
  // XML parser would not be able to parse correctly.
  //
  // In the future, a different parser might be chosen to improve performance.
  // For a selection of parsers, see
  // https://stackoverflow.com/questions/11398419/trying-to-use-the-domparser-with-node-js.
  const dom = new JSDOM(svgString);
  // The SVG element is dom.window.document.body.children[0], but we need to
  // return the document instead, otherwise the SVG element's outerHTML cannot
  // be set for some strange reason (perhaps the document is picked up by the
  // garbage collector?).
  return dom.window.document;
}

/**
 * Serilialize the SVG DOM.
 * This is preferred to using `svgDOM.querySelector('svg').outerHTML`, as that
 * would not utilize XML's self-closing tags (e.g. `<path ... />`), and
 * therefore would result in a worse compression ratio. XMLSerializer treats
 * empty elements inside `<foreignObject>` elements correctly, and does not
 * convert them to self-closing tags (which would be invalid HTML).
 * @param {object} svgDOM - SVG DOM
 * @return {string} - Serialized DOM
 */
export function serialize(svgDOM) {
  const XMLSerializer = new JSDOM().window.XMLSerializer;
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgDOM.querySelector('svg'));
  // Remove XHTML namespace declaration from `<div>` element inside
  // `<foreignObject>`.
  return svgString
      .replaceAll(/ xmlns="http:\/\/www.w3.org\/1999\/xhtml"/ig, '');
}

/**
 * Reduce precision of number to eliminate floating point errors.
 * @param {number} number - Number to round
 * @return {number} - Rounded number
 */
export function round(number) {
  return parseFloat(number.toPrecision(10));
}

/**
 * Flatten children of passed DOM element, by replacing child elements with
 * their content.
 * @param {object} textElt - Element whose children are to be flattened
 */
export function flattenTextChildren(textElt) {
  const childrenToBeFlattened = [];
  for (const child of textElt.children) {
    childrenToBeFlattened.push(child);
  }
  childrenToBeFlattened.forEach( (child) => {
    // Inkscape sometimes sets font-size for a `<tspan>` element, but not for
    // the parent `<text>` element.
    const fontSize = child.style.getPropertyValue('font-size');
    fontSize && textElt.style.setProperty('font-size', fontSize);
    child.replaceWith(child.innerHTML);
  });
}

/**
 * Run pandoc.
 * @param {object} obj
 * @param {string} obj.from - Format to be converted
 * @param {string} obj.to - Output format
 * @param {string} obj.input - Input to be passed to pandoc via stdin
 * @return {string} - Pandoc output
 */
export function pandoc({from, to, input, options = ''}) {
  return execSync(
      `pandoc --from=${from} --to=${to} --mathjax ${options}`,
      {input: input})
      .toString();
}

/**
 * Convert JSON representation of Inline AST elements to HTML.
 * @param {array} inlineAST - Array of Inline AST elements
 * @return {string} - HTML representation of AST elements
 */
export function ast2html(inlineAST) {
  const astStr = JSON.stringify({
    'pandoc-api-version': [1, 22, 2, 1],
    'meta': {},
    'blocks': [{'t': 'Para', 'c': inlineAST}],
  });
  const html = pandoc({from: 'json', to: 'html', input: astStr});
  return /^<p>(?<content>.*)<\/p>\n$/.exec(html).groups.content;
}

/**
 * Convert equation delimiters from '$' to '\(' / '\)'. MathJax's default
 * configuration expects delimiters '\(' and '\)' instead of'$'. This function
 * is used if the markdown text to be processed is just an equation. This saves
 * calling pandoc to perform the markdown conversion, which should result in
 * performance improvements.
 * @param {string} text - Text containing MathJax equation(s) delimited by '$'
 * @return {string} - Text containing equation(s) delimited by `\(`/`\)`
 */
export function convertMathJaxDelimiters(text) {
  // MathJax's default configuration expects delimiters '\(' and '\)'
  // instead of'$'.
  return text.replace(/\$(.+?)\$/g, '\\($1\\)');
}

/**
 * Convert markdown to HTML.
 * @param {string} markdown - Markdown to be converted
 * @return {string} - Resulting HTML
 */
export function md2html(markdown) {
  // If the text is just an equation (begins and ends with '$', and contains
  // no '$' inbetween), as is frequently the case, calling pandoc can be
  // avoided and the the equation can be converted to MathJax syntax directly.
  const equationRegex = /^\$[^\$]+\$/;
  if (equationRegex.exec(markdown)) {
    return '<p><span class="math inline">' +
           convertMathJaxDelimiters(markdown) +
           '</span></p>';
  } else {
    return pandoc({
      from: 'markdown',
      to: 'html',
      input: markdown,
      options: '--mathjax',
    }).replace(/\n/, ''); // Strip trailing newline.
  }
}

/**
 * Pass through known HTML5 attributes, prepend unknown attributes with
 * `data-`. See https://pandoc.org/MANUAL.html#extension-link_attributes.
 * @param {array} keyvals - Key-value pairs
 * @return {array} - Valid HTML5 key-value pairs
 */
export function toHTML5keyvals(keyvals) {
  return keyvals.map( ([key, val]) => {
    key = html5attrs.has(key) ? key : 'data-' + key;
    return [key, val];
  });
}

/**
 * Flag to be set when Inkscape version error has been printed.
 * @type {boolean}
 */
let printedInkscapeVersionErrorMsg = false;

/**
 * Check if valid Inkscape version is installed.
 * @return {boolean} - Whether valid Inkscape version is installed
 */
export function validInkscapeVersion() {
  if (!commandExists('inkscape')) {
    if (!printedInkscapeVersionErrorMsg) {
      console.error(
          'pandoc-svg: No Inkscape installation was found! The command ' +
          '`inkscape` must be available in the shell. If Inkscape is ' +
          'installed, make sure it has been added to the PATH.\n' +
          'Inkscape is needed to convert an SVG to a .pdf_tex file for ' +
          'LaTeX/PDF output only.');
      printedInkscapeVersionErrorMsg = true;
    }
    return false;
  }
  const stdout = execSync('inkscape --version').toString();
  const inkscapeVersion =
      /^Inkscape (?<version>[\d\.]+)/.exec(stdout).groups.version;
  const match = /^(?<major>\d+)\.(?<minor>\d+)/.exec(inkscapeVersion);
  // Minimum Inkscape version is yet to be determined. Here it is preliminarily
  // set to 0.48.
  if (match.groups.major === '0') {
    if ( !(Number(match.groups.minor) >= 49) ) {
      if (!printedInkscapeVersionErrorMsg) {
        console.error(
            'pandoc-svg: Inkscape version must be at least 0.48. ' +
            `The installed version is ${inkscapeVersion}.\n` +
            'Inkscape is needed to convert an SVG to a .pdf_tex file for ' +
            'LaTeX/PDF output only.');
        printedInkscapeVersionErrorMsg = true;
      }
      return false;
    }
  }
  return true;
}
