import { Graphics } from 'pixi.js';

export class TerritoryRenderer {
  readonly graphics = new Graphics();
  private renderedRevision = -1;

  render(
    revision: number,
    cells: Uint16Array,
    colors: Map<number, number>,
    size: number,
    cellSize: number
  ): void {
    if (revision === this.renderedRevision || cells.length === 0) return;
    this.renderedRevision = revision;
    this.graphics.clear();
    const offset = (size * cellSize) / 2;
    for (let row = 0; row < size; row += 1) {
      let column = 0;
      while (column < size) {
        const owner = cells[row * size + column] ?? 65_535;
        if (owner === 0 || owner === 65_535) {
          column += 1;
          continue;
        }
        let end = column + 1;
        while (end < size && cells[row * size + end] === owner) end += 1;
        this.graphics
          .rect(
            column * cellSize - offset - 0.5,
            row * cellSize - offset - 0.5,
            (end - column) * cellSize + 1,
            cellSize + 1
          )
          .fill({ color: colors.get(owner) ?? 0x94a3b8, alpha: 0.43 });
        column = end;
      }
    }
  }
}
