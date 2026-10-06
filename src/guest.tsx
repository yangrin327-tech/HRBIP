import { createContext, useContext } from "react";
import type { CompanyFormat, Binding } from "../shared/company-format";

export type GuestFormat = {
  meta: CompanyFormat;
  input: {
    name: string;
    data: string;
    title: string;
    bindings: Binding[];
    confirmed: true;
    brand: { font: string; color: string };
  };
};
// Memory only: no localStorage, IndexedDB, cookies or server-backed uploads.
export const GuestContext = createContext({
  enabled: true,
  formats: [] as GuestFormat[],
  setFormats: (_formats: GuestFormat[]) => {},
});
export const useGuest = () => useContext(GuestContext);
