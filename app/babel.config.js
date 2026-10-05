// Configuração padrão do Expo (explícita para o Jest com preset de plataforma Android).
module.exports = function (api) {
  api.cache(true);
  return { presets: ["babel-preset-expo"] };
};
