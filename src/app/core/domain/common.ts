enum QueryLengthUnit {
  BASE_PAIRS = 0,
  BINS = 1,
  PIXELS = 2,
}

enum ContigDirection {
  FORWARD = 1,
  REVERSED = 0,
}

enum ScaffoldDirection {
  FORWARD = 1,
  REVERSED = 0,
}

enum ContigHideType {
  AUTO_HIDDEN = 0,
  AUTO_SHOWN = 1,
  FORCED_HIDDEN = 2,
  FORCED_SHOWN = 3,
}

enum NormalizationType {
  LINEAR = 0,
  LOG2 = 1,
  LOG10 = 2,
  COOLER_BALANCE = 3,
}

export { QueryLengthUnit, ContigDirection, ScaffoldDirection, ContigHideType, NormalizationType };
