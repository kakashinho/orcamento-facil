// Substituto do expo-secure-store nos testes de contrato (Node, sem Keystore).
const store = new Map();
module.exports = {
  getItemAsync: async (key) => (store.has(key) ? store.get(key) : null),
  setItemAsync: async (key, value) => {
    store.set(key, value);
  },
  deleteItemAsync: async (key) => {
    store.delete(key);
  },
};
