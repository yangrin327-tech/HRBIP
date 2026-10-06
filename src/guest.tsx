import {
  createContext,
  useContext,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { RawSheet } from "./files";
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
// Guest work is stored on this browser; server processing remains stateless.
export const GuestContext = createContext({
  enabled: true,
  formats: [] as GuestFormat[],
  setFormats: async (_formats: GuestFormat[]) => {},
  sheets: [] as RawSheet[],
  setSheets: (() => {}) as Dispatch<SetStateAction<RawSheet[]>>,
});
export const useGuest = () => useContext(GuestContext);
