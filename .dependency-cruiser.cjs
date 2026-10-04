/** R03: rules run over dependency-cruiser's resolved TypeScript dependency graph. */
module.exports = {
  forbidden: [
    { name: "no-cycles", severity: "error", from: {}, to: { circular: true } },
    {
      name: "resolve-owned-imports",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "module-public-entrypoint",
      severity: "error",
      from: { path: "^(.+/(?:services|screens)/[^/]+)/" },
      to: {
        path: "/(?:services|screens)/[^/]+/(?!index\\.ts$)",
        pathNot: "^$1/",
      },
    },
    {
      name: "external-public-entrypoint",
      severity: "error",
      from: { pathNot: "/(?:services|screens)/[^/]+/" },
      to: { path: "/(?:services|screens)/[^/]+/(?!index\\.ts$)" },
    },
    {
      name: "service-no-screen",
      severity: "error",
      from: { path: "/services/" },
      to: { path: "/screens/|(?:^|/)packages/storefront/index\\.tsx?$" },
    },
    {
      name: "data-no-interface",
      severity: "error",
      from: { path: "/data/" },
      to: {
        path: "/(?:screens/|interface/)|(?:^|/)node_modules/(?:@types/)?(?:react|expo-router)(?:/|$)",
      },
    },
    {
      name: "logic-no-interface",
      severity: "error",
      from: { path: "/logic/" },
      to: { path: "/interface/" },
    },
    {
      name: "interface-no-data",
      severity: "error",
      from: { path: "/interface/" },
      to: { path: "/data/" },
    },
    {
      name: "pure-logic-no-framework",
      severity: "error",
      from: { path: "/services/[^/]+/logic/|/logic/pure/" },
      to: {
        path: "/(?:data|interface)/|(?:^|/)node_modules/(?:@types/)?(?:react|react-native|expo[^/]*)(?:/|$)",
      },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: {
      path: "(^|/)(?:dist|dist-native|\\.expo)/|packages/api-client/generated/",
    },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.eslint.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["types", "import", "default"],
      extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
    },
  },
};
