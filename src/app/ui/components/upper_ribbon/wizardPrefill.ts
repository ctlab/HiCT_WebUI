/** Files the opening wizard starts with, as paths relative to the server data folder. */
export type WizardPrefill = {
  matrix?: string;
  fasta?: string;
  /** An AGP or a Juicebox .assembly. */
  agp?: string;
};
