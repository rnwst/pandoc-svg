'use strict';

/** ****************************************************************************
# IMPORTANT NOTE #
The code in this file has been written for LaTeX/PDF support. It is untested and
DOESN'T CURRENTLY WORK! This is due to this issue:
https://github.com/jsdom/jsdom/issues/2531.
jsdom doesn't currently support many SVG features. Before LaTeX/PDF support can
be developed, this needs to be fixed.
*******************************************************************************/

/**
 * Calculate transform matrix of element, taking into account all transforms of
 * its ancestors.
 * @param {object} elt - Element whose transform matrix is to be calculated
 * @return {object} - Transform matrix
 */
export function transformMatrix(elt) {
  // Calling elt.transform.baseVal.consolidate() actually replaces the transform
  // value by a matrix. This is undesired in most cases (as e.g.
  // 'translate(x, y)' is more readable than 'matrix(1, 0, 0, 1, x, y)'). To
  // avoid this, we need to create a new DOM element for the sole purpose of
  // consolidating the SVGTransformList. This is necessary because running
  // `new SVGTransform()` results in the error
  // `Uncaught TypeError: Illegal constructor.`
  // The element type doesn't matter too much, as long as it has a `transform`
  // attribute.
  const consolidatedTransform = (elt) => {
    const ghostElt =
        elt.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
    const transformList = ghostElt.transform.baseVal;
    [...elt.transform.baseVal].forEach( (transform) => {
      transformList.appendItem(transform);
    });
    return transformList.consolidate();
  };

  // Array to contain the element's and its ancestors' SVGTransforms.
  const svgTransforms = [consolidatedTransform(elt)];

  let ancestor = elt.parentElement;
  while (ancestor !== elt.ownerSVGElement) {
    // Insert transform matrix at the start of the array (as we are going back
    // up the chain).
    // If no transform is specified, consolidate() will return null.
    svgTransforms.unshift(consolidatedTransform(ancestor));
    // Move up one level in the ancestry tree.
    ancestor = ancestor.parentElement;
  }
  // Remove null values.
  svgTransforms = svgTransforms.filter(Boolean);

  // Construct SVGTransformList from all the SVGTransforms.
  const ghostElt =
      elt.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
  const transformList = ghostElt.transform.baseVal;
  svgTransforms.forEach( (svgTransform) => {
    transformList.appendItem(svgTransform);
  });
  const matrix = transformList.consolidate().matrix;

  return matrix;
}

/** ****************************************************************************

Intermission: A Note on Transform Matrices
==========================================

The transform matrix is defined as follows:

┌ x_global ┐   ┌ a  c  e ┐ ┌ x_local ┐
│ y_global │ = │ b  d  f │ │ y_local │
└        1 ┘   └ 0  0  1 ┘ └       1 ┘

(see
https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/transform).

The transform can be split into four distinct operations:

(1) A scaling in the x- and y-directions by factors a and b respectively. This
    is equivalent to `transform="scale(α, β)"`. The transform matrix for this
    operation is

    ┌ α  0  0 ┐
    │ 0  β  0 │
    └ 0  0  1 ┘.

(2) A skewing/shearing operation that leaves the x-axis untransformed but
    rotates the y-axis such that the angle between the x- and y-axis decreases
    by an angle φ. This is equivalent to `transform="skewX(φ)"`. The transform
    matrix for this operation is

    ┌ 1  sin(φ)  0 ┐
    │ 0      1   0 │
    └ 0      0   1 ┘.

(3) A rotation about the origin by an angle θ (note that the y-direction is
    downwards and θ is measured downwards as well). This is equivalent to
    `transform="rotate(θ)"`. The transform matrix for this operation is

    ┌ cos(θ)  -sin(θ)  0 ┐
    │ sin(θ)   cos(θ)  0 │
    └     0        0   1 ┘.

(4) A translation by an amount Δx and Δy in the x- and y-directions
    respectively.The transform matrix for this operation is

    ┌ 1  0  Δx ┐
    │ 0  1  Δy │
    └ 0  0   1 ┘.

The value of the parameters α, β, φ, θ, Δx, and Δy depends on the order of these
operations. Some orders make life easier than others. If the axes of the
transformed coordinate system are to remain orthogonal in the absence of any
skewing, the scaling operation needs to happen before the rotation. If the
translation is to happen in the global coordinate system, it needs to happen
last. If the skewing angle is to remain constant irrespective of any scaling,
the skewing needs to happen after the scaling. That leaves only one sensible
order of operations:

┌4. trans- ┐ ┌3.                  ┐ ┌2. skewing/   ┐ ┌1. sca-  ┐
└   lation ┘ └           rotation ┘ └     shearing ┘ └    ling ┘

┌ 1  0  Δx ┐ ┌ cos(θ)  -sin(θ)  0 ┐ ┌ 1  sin(φ)  0 ┐ ┌ α  0  0 ┐
│ 0  1  Δy │ │ sin(θ)   cos(θ)  0 │ │ 0      1   0 │ │ 0  β  0 │
└ 0  0   1 ┘ └     0        0   1 ┘ └ 0      0   1 ┘ └ 0  0  1 ┘

                                       ┌ α*cos(θ)  β*cos(θ)sin(φ)-β*sin(θ)  Δx ┐
                                     = │ α*sin(θ)  β*sin(θ)sin(φ)+β*cos(θ)  Δy │
                                       └       0                        0    1 ┘

The values of these parameters are determined in the function below. This is
needed to assemble the code inside the `picture` environment for LaTeX output.

*******************************************************************************/

/**
 * Extract transform operations from matrix.
 * @param {object} matrix - Transformation matrix
 * @return {object} - Transforms
 */
export function calcTransforms(matrix) {
  const deltaX = matrix.e;
  const deltaY = matrix.f;

  const toDegrees = (radians) => {
    return radians * (180 / Math.PI);
  };

  const alphaCosTheta = matrix.a;
  const alphaSinTheta = matrix.b;

  const c = matrix.c;
  const d = matrix.d;

  const tanTheta = alphaSinTheta / alphaCosTheta;
  let theta = Math.atan(tanTheta);
  // We don't yet know if θ is atan(θ) or atan(θ)+π. If we assume that
  // α > 0, θ can be determined:
  theta = (alphaCosTheta >= 0) ? theta : theta + Math.PI;
  // (this constrains theta to the interval -90°; +270°.)

  const sin = (angle) => Math.sin(angle);
  const cos = (angle) => Math.cos(angle);

  const alpha = alphaCosTheta / cos(theta);

  const phi = Math.asin(
      ( c/d * cos(theta) + sin(theta) ) / ( cos(theta) - c/d * sin(theta) ) );

  const beta = c / ( cos(theta) * sin(phi) - sin(theta) );

  return {
    scale: [alpha, beta],
    skewX: toDegrees(phi),
    rotate: toDegrees(theta),
    translate: [deltaX, deltaY],
  };
}

/**
 * Determine maximum possible dimension across SVG in local coordinates by
 * considering viewBox and taking into account all transforms on ancestors.
 * @param {object} elt - SVG DOM element
 * @return {number} - Maximum dimension in local coordinates
 */
export function maxLocalDim(elt) {
  // In 'user units'.
  const viewBox = elt.ownerSVGElement.viewBox.baseVal;
  const minX = viewBox.x; const minY = viewBox.y;
  const width = viewBox.width; const height = viewBox.height;

  // eslint-disable-next-line require-jsdoc
  function Vector(x, y) {
    this.x = x;
    this.y = y;
    this.premultiply = (matrix) => {
      const newX = matrix.a * vector.x + matrix.c * vector.y + matrix.e;
      const newY = matrix.b * vector.x + matrix.d * vector.y + matrix.f;
      return new Vector(newX, newY);
    };
    this.subtract = (vector) => {
      return new Vector(this.x - vector.x, this.y - vector.y);
    };
    this.length = () => Math.sqrt(this.x**2 + this.y**2);
  };

  const globalUpperLeft = new Vector(minX, minY);
  const globalUpperRight = new Vector(minX + width, minY);
  const globalLowerLeft = new Vector(minX, minY + height);
  const globalLowerRight = new Vector(minX + width, minY + height);

  const matrix = transformMatrix(elt);
  const inverse = matrix.inverse();

  const localUpperLeft = globalUpperLeft.premultiply(inverse);
  const localUpperRight = globalUpperRight.premultiply(inverse);
  const localLowerLeft = globalLowerLeft.premultiply(inverse);
  const localLowerRight = globalLowerRight.premultiply(inverse);

  const localDiagonal1 = localLowerRight.subtract(localUpperLeft).length();
  const localDiagonal2 = localLowerLeft.subtract(localUpperRight).length();

  const maxLocalDim = Math.max(localDiagonal1, localDiagonal2);
  return maxLocalDim;
}
