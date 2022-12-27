---
title: A Test
math: |
  <script>
    MathJax = {
      startup: {
        ready() {
          MathJax._.core.MmlTree.MmlNodes.math.MmlMath.defaults.scriptminsize = '6pt';
          MathJax.startup.defaultReady();
        }
      }
    }
  </script>
  <script
   async
   src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg-full.js">
  </script>
---

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

![Caption 1](tests/example-math.svg){#id1 .class key="val"}

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

![Caption 2](tests/example-text.svg){#id2 .class key="val"}
