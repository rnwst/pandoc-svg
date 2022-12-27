'use strict';

import * as pandocfilters from 'pandoc-filter';
import {main as optimize} from './optimize.js';
import resize from './resize.js';
import svg2to11 from './svg2to11.js';
import text2foreignObject from './text2foreignObject.js';
import * as utils from './utils.js';

/**
 * Pandoc filter function.
 * @param {object} astElement - Pandoc AST element
 * @param {string} astElement.t - Type of AST elmenet
 * @param {array} astElement.c - Contents of AST element
 * @param {string} format - Output format
 * @param {object} meta - Metadata from Pandoc's AST
 * @return {object} - `RawBlock`/`RawInline`
 */
export default function filter({t: key, c: value}, format, meta) {
  if (!utils.compatibleOutputFormat(format)) {
    return;
  }

  // Reduce typing effort for the rest of this function. Note that LaTeX/HTML
  // is not yet supported.
  format = (format === 'pdf') ? 'latex' : format;

  // When format is HTML, figures (paragraphs whose only child is an image whose
  // title attribute starts with 'fig:', see utils.isFigure) are replaced with
  // `RawBlock`s (to inline the SVG). For all other output formats, the file
  // reference in the `Image` AST element is simply replaced, irrespective of
  // whether the SVG is a figure or an image.
  const validASTElement =
      (format === 'html') ?
      (utils.isImage(key) || utils.isFigure(key, value)) : utils.isImage(key);
  if (!validASTElement) {
    return;
  }

  const imageValue = utils.isFigure(key, value) ? value[0]['c'] : value;
  // https://hackage.haskell.org/package/pandoc-types-1.22.2.1/docs/Text-Pandoc-Definition.html#t:Inline
  let [[id, classes, keyvals], caption, [fname, title]] = imageValue;

  if (!utils.isSVG(fname)) {
    return;
  }

  // If SVG has class 'ignore', remove class and return.
  if (classes.includes('ignore')) {
    classes.splice(classes.indexOf('ignore'), 1);
    const image = // eslint-disable-next-line new-cap
        pandocfilters.Image([id, classes, keyvals], caption, [fname, title]);
    return utils.isFigure(key, value) ? {'t': 'Para', 'c': [image]} : image;
  }

  // Load SVG, then load the SVG's DOM using jsdom.
  let svgString = utils.loadSVG(fname);
  if (!svgString) {
    return;
  }
  const svgDOM = utils.createDOM(svgString);

  // Resize SVG?
  const dimKeyvals = [];
  keyvals = keyvals.filter( ([key, val]) => {
    if (key === 'width' || key === 'height') {
      dimKeyvals.push([key, val]);
      return false;
    }
    return true;
  });
  if (dimKeyvals.length !== 0) {
    const dimObj = Object.fromEntries(dimKeyvals);
    resize(svgDOM, dimObj);
  } else {
    if (!classes.includes('keep-size')) {
      let scaleFactor;
      keyvals = keyvals.filter( ([key, val]) => {
        if (key === 'scale-factor') {
          scaleFactor = val;
          return false;
        }
        return true;
      });
      resize(svgDOM, {scaleFactor: scaleFactor});
    } else {
      classes.splice(classes.indexOf('keep-size'), 1);
    }
  }

  if (format === 'html') {
    // Optimize SVG. This needs to be done before text2foreignObject is called,
    // due to this issue: https://github.com/svg/svgo/issues/1728.
    optimize({svgDOM});

    // Transform `<text>` elements to `<foreignObject>` elements.
    text2foreignObject(svgDOM);

    // Convert SVG 2 to SVG 1.1.
    svg2to11(svgDOM);

    const html5Keyvals = utils.toHTML5keyvals(keyvals);
    if (utils.isFigure(key, value)) {
      svgString = utils.serialize(svgDOM);
      // Wrap SVG in `<figure>` tag with caption if SVG is figure and add id,
      // classes, keyvals.
      const kvStr = Array.from(html5Keyvals, ([key, val]) => `${key}="${val}"`);
      svgString =
          `<figure id=${id} class="${classes.join(' ')}" ` +
              `${kvStr.join(' ')}>\n` +
          '  ' + svgString + '\n' +
          `  <figcaption aria-hidden="true">${utils.ast2html(caption)}` +
            '</figcaption>\n' +
          '</figure>';
    } else {
      // Add id, classes, keyvals to SVG DOM if SVG is Image.
      if (id.length !== 0) {
        svgDOM.querySelector('svg').id = id;
      }
      svgDOM.className = classes.join(' ');
      html5Keyvals.forEach( ([key, val]) => {
        svgDOM.querySelector('svg').setAttribute(key, val);
      });
      svgString = utils.serialize(svgDOM);
    }

    /* eslint-disable new-cap */
    return utils.isFigure(key, value) ?
        pandocfilters.RawBlock('html', svgString) :
        pandocfilters.RawInline('html', svgString);
    /* eslint-enable new-cap */
  }
}
