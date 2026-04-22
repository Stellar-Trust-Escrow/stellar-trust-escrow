import { requestWithRetry } from "../lib/api/client";
import { parseError } from "../lib/api/errorParser";

export async function fetchData() {
  try {
    const res = await requestWithRetry({ method: "GET", url: "/some-endpoint" });
    console.log(res.data);
  } catch (err) {
    const friendlyMessage = parseError(err);
    alert(friendlyMessage); // Or display in UI component
  }
}
