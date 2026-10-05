import { Redirect } from "expo-router";

/** Link desconhecido: volta ao início (ou ao login, sem sessão). */
export default function NotFound() {
  return <Redirect href="/" />;
}
