/**
 * Módulos nativos instalados como dependências opcionais do expo-router que o app não usa
 * (pilha JS com gestos, animações Reanimated e máscara de cabeçalho do iOS). Ficam fora do
 * build Android: APK menor e compilação mais rápida.
 */
const unused = [
  "react-native-reanimated",
  "react-native-worklets",
  "react-native-gesture-handler",
  "@react-native-masked-view/masked-view",
];

module.exports = {
  dependencies: Object.fromEntries(unused.map((name) => [name, { platforms: { android: null, ios: null } }])),
};
