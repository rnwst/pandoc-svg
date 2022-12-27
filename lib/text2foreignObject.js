'use strict';

import * as utils from './utils.js';

/**
 * Convert `<text>` elements to `<foreignObject>` elements.
 * `<foreignObject>` elements are SVG elements that contain regular HTML. See
 * https://developer.mozilla.org/en-US/docs/Web/SVG/Element/foreignObject.
 * @param {object} svgDOM - SVG DOM
 */
export default function text2foreignObject(svgDOM) {
  svgDOM.querySelectorAll('text').forEach( (textElt) => {
    // Flatten all children of text element.
    utils.flattenTextChildren(textElt);

    // Convert content of text element from markdown to html.
    const markdown = textElt.innerHTML;
    // Remove empty `<text>` elements.
    if (markdown.length === 0) {
      textElt.remove();
      return;
    }
    const html = utils.md2html(markdown);

    // Create `<foreignObject>` element.
    // Namespace needs to be set for correct capitalization of `foreignObject`.
    const foreignObject =
        svgDOM.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');

    // The contents of the `<foreignObject>` element need to be positioned by
    // their baseline position, as this is how `<text>` elements in SVGs are
    // positioned. This is not so straightforward to accomplish with CSS, and
    // requires a somewhat hacky approach. Elements with `position:
    // inline-block` are positioned with their baselines aligned. Therefore,
    // baseline-positioning can be achieved by inserting an empty `<span>`
    // element with `display: inline-block` at the beginning of the contents of
    // the first `<p>` element inside the `<foreignObject>`. Furthermore, if
    // `text-anchor:middle/end` is set on the `<text>` element, the
    // `<foreignObject>`'s contents need to be translated to the left by the
    // appropriate amount. Therefore, `transform="translateX(-0/50/100%)` is set
    // on all of the `<foreignObject>`'s children. The transform cannot be set
    // on the `<foreignObject>`, as its width does not usually correspond to the
    // width of its contents.

    // Position `<foreignObject>` at same x-location as `<text>` element.
    foreignObject.setAttribute('x', textElt.getAttribute('x'));
    // Position `<foreignObject>` at same y-location as `<text>` element.
    foreignObject.setAttribute('y', textElt.getAttribute('y'));

    // A `<foreignObject>` needs to have its width and height set. It is easiest
    // to set width and height to '1' and set the property `overflow="visible"`
    // when no `<text>` width is specified. Unfortunately, a width of '1'
    // cannot be used when the `text-anchor` style property value is anything
    // but 'start', as the elements within the `<foreignObject>` need to be
    // translated to the left by either 50% or 100%. If the `<foreignObject>`
    // isn't wide enough to contain its elements, the transform will not
    // translate the elements sufficiently far to the left (the style property
    // `text-align` unfortunately has no effect when an element is overflowing).
    // It is difficult to determine a `<foreignObject>` width large enough to
    // contain its elements. One cannot simply choose the `viewBox` width, as
    // it is subject to any transforms of ancestor elements of the
    // `<foreignObject>`. Here I am setting the width to '1000' if no `<text>`
    // width is specified, which should be large enough in most cases. In the
    // future I might develop a more sophisticated method to work out an
    // appropriate value.
    //
    // SVG `<text>` elements have no `width` property to determine line break
    // positions (see
    // https://developer.mozilla.org/en-US/docs/Web/SVG/Element/text). Inkscape
    // achieves line breaks by wrapping lines in separate `<tspan>` elements and
    // manually positioning them underneath each other. It stores the text width
    // in the style attribute `inline-size` (as a dimensionless number, which is
    // invalid CSS). The SVG 2 standard proposes to use the `inline-size`
    // property for automatic line wrapping, but no browser supports this yet.
    // Inkscape version: 1.2.1

    // Determine width of text element, if it has been set, and set it on the
    // `<foreignObject>`.
    const textWidth = textElt.style.getPropertyValue('inline-size');
    const foreignObjectWidth = textWidth ? textWidth : '1000';
    foreignObject.setAttribute('width', foreignObjectWidth);
    foreignObject.setAttribute('height', '1');
    foreignObject.setAttribute('overflow', 'visible');

    // If any transforms are present on `<text>` element, they need to be
    // copied.
    const transform = textElt.getAttribute('transform');
    transform && foreignObject.setAttribute('transform', transform);

    // Copy `font-size` from `<text>` element to `<foreignObject>` element.
    let fontSize = textElt.style.getPropertyValue('font-size');
    // In case the element doesn't have a font-size specified, it is nominally
    // set to 16px.
    fontSize = fontSize? fontSize : '16px';
    foreignObject.style.setProperty('font-size', fontSize);

    // Copy `font-family` from `<text>` element to `<foreignObject>` element.
    const fontFamily = textElt.style.getPropertyValue('font-family');
    fontFamily && foreignObject.style.setProperty('font-family', fontFamily);

    // Set text color.
    const color = textElt.style.getPropertyValue('fill');
    color && foreignObject.style.setProperty('color', color);

    // Set opacity.
    const opacity = textElt.style.getPropertyValue('opacity');
    opacity && foreignObject.style.setProperty('opacity', opacity);

    // Add content to `<foreignObject>`.
    foreignObject.innerHTML = html;

    // Insert empty `<span>` element with `display: inline-block` at the
    // beginning of the contents of the first `<p>` element inside the
    // `<foreignObject>`. Its height is equal to the negative top-margin of the
    // first paragraph inside `<foreignObject>`. A negative margin is needed for
    // the first paragraph to avoid it being shifted downwards. The margin
    // magnitude is set to 20x font-size, which should be a safe value even for
    // the most unconventional of fonts and the tallest of inline images.
    const span = svgDOM.createElement('span');
    const multFactor = 20;
    const xTimesFontSize =
        Math.ceil( multFactor *
          Number(/(?<size>[\d\.]+)px/.exec(fontSize).groups.size)) +
        'px';
    span.style.setProperty('height', xTimesFontSize);
    span.style.setProperty('display', 'inline-block');
    foreignObject.children[0].prepend(span);
    foreignObject.children[0]
        .style.setProperty('margin-top', '-' + xTimesFontSize);

    // If the `<text>` element's `text-anchor` style property is not 'start',
    // the `<foreignObject>`'s contents need to be shifted to the left. The
    // corresponding style property value for `text-align` also needs to be set
    // for the `<foreignObject>`.
    const textAnchor = textElt.style.getPropertyValue('text-anchor');
    let translateX;
    let textAlign;
    if (textAnchor === 'middle') {
      translateX = -50;
      textAlign = 'center';
    } else if (textAnchor === 'end') {
      translateX = -100;
      textAlign = 'end';
    } else {
      translateX = 0;
      textAlign = 'start';
    }
    for (const child of foreignObject.children) {
      if (translateX !== 0) {
        child.style.setProperty('transform', `translateX(${translateX}%)`);
        foreignObject.style.setProperty('text-align', textAlign);
      }
    }

    // Finally, replace `<text>` element with `<foreignObject>` element.
    textElt.replaceWith(foreignObject);
  });
}
