declare module "plotly.js-basic-dist-min" {
  const plotly: {
    react(
      element: HTMLElement,
      data: object[],
      layout: object,
      config: object
    ): Promise<unknown>;
    relayout(element: HTMLElement, layout: object): Promise<unknown>;
    purge(element: HTMLElement): void;
  };
  export default plotly;
}
