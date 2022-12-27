export default {
  js2svg: {
    indent: 2,
    pretty: true,
  },
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          mergePaths: false,
          removeComments: false,
        },
      },
    },
  ],
};
