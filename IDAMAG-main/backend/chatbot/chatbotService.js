/**
 * Chatbot calculation service.
 *
 * This file answers questions using rows already loaded
 * from the public Google Sheet.
 */

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\w\s().-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeColumnName(value) {
  return normalizeText(value)
    .replace(/\bnumber of\b/g, "no")
    .replace(/\bexpected\b/g, "")
    .replace(/\btotal\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumber(value) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  ) {
    return null;
  }

  const cleanedValue = String(value)
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "")
    .trim();

  if (
    cleanedValue === "" ||
    cleanedValue === "-" ||
    cleanedValue === "."
  ) {
    return null;
  }

  const number = Number(cleanedValue);

  return Number.isFinite(number) ? number : null;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function getAllColumns(rows) {
  const columns = new Set();

  for (const row of rows) {
    Object.keys(row).forEach((column) => {
      columns.add(column);
    });
  }

  return Array.from(columns);
}

function findColumn(question, columns) {
  const normalizedQuestion = normalizeColumnName(question);

  const directMatches = columns.filter((column) => {
    const normalizedColumn = normalizeColumnName(column);

    return (
      normalizedQuestion.includes(normalizedColumn) ||
      normalizedColumn.includes(normalizedQuestion)
    );
  });

  if (directMatches.length > 0) {
    return directMatches.sort(
      (a, b) =>
        normalizeColumnName(b).length -
        normalizeColumnName(a).length
    )[0];
  }

  let bestColumn = null;
  let bestScore = 0;

  for (const column of columns) {
    const words = normalizeColumnName(column)
      .split(" ")
      .filter(Boolean);

    if (words.length === 0) {
      continue;
    }

    const matchedWords = words.filter((word) =>
      normalizedQuestion.includes(word)
    );

    const score = matchedWords.length / words.length;

    if (score > bestScore) {
      bestScore = score;
      bestColumn = column;
    }
  }

  return bestScore >= 0.5 ? bestColumn : null;
}

function findFilter(rows, question, excludedColumn = null) {
  const normalizedQuestion = normalizeText(question);
  const columns = getAllColumns(rows);

  for (const column of columns) {
    if (column === excludedColumn) {
      continue;
    }

    const values = Array.from(
      new Set(
        rows
          .map((row) => row[column])
          .filter(
            (value) =>
              value !== null &&
              value !== undefined &&
              String(value).trim() !== ""
          )
          .map((value) => String(value).trim())
      )
    );

    if (values.length > 200) {
      continue;
    }

    values.sort((a, b) => b.length - a.length);

    for (const value of values) {
      const normalizedValue = normalizeText(value);

      if (
        normalizedValue.length >= 2 &&
        normalizedQuestion.includes(normalizedValue)
      ) {
        return {
          column,
          value,
        };
      }
    }
  }

  return null;
}

function applyFilter(rows, filter) {
  if (!filter) {
    return rows;
  }

  return rows.filter(
    (row) =>
      normalizeText(row[filter.column]) ===
      normalizeText(filter.value)
  );
}

function findNumericColumn(rows, question, columns) {
  const column = findColumn(question, columns);

  if (!column) {
    return null;
  }

  const hasNumericValues = rows.some(
    (row) => parseNumber(row[column]) !== null
  );

  return hasNumericValues ? column : null;
}

function countByColumn(rows, column) {
  const counts = {};

  for (const row of rows) {
    const value = String(row[column] ?? "").trim();

    if (!value) {
      continue;
    }

    counts[value] = (counts[value] || 0) + 1;
  }

  return Object.entries(counts).sort(
    (a, b) => b[1] - a[1]
  );
}

function createHelpMessage(columns) {
  return (
    "I can answer questions using these columns: " +
    columns.join(", ") +
    '. Examples: "How many farms are there?", ' +
    '"What is the total Area (ha)?", ' +
    '"What is the average Expected Yield (tons)?", ' +
    '"Which municipality has the most farms?", or ' +
    '"How many farms are active?"'
  );
}

function answerQuestion(rows, question) {
  if (!question || !String(question).trim()) {
    return {
      success: false,
      answer: "Please enter a question.",
    };
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      success: false,
      answer: "The selected Google Sheet has no available data.",
    };
  }

  const normalizedQuestion = normalizeText(question);
  const columns = getAllColumns(rows);

  const selectedColumn = findColumn(question, columns);
  const filter = findFilter(
    rows,
    question,
    selectedColumn
  );

  const filteredRows = applyFilter(rows, filter);

  const filterText = filter
    ? ` where ${filter.column} is "${filter.value}"`
    : "";

  if (
    normalizedQuestion === "help" ||
    normalizedQuestion.includes("what can i ask") ||
    normalizedQuestion.includes("what can you answer") ||
    normalizedQuestion.includes("available columns")
  ) {
    return {
      success: true,
      operation: "help",
      answer: createHelpMessage(columns),
    };
  }

  if (
    /\b(highest|maximum|max|largest|greatest)\b/.test(
      normalizedQuestion
    )
  ) {
    const numericColumn = findNumericColumn(
      rows,
      question,
      columns
    );

    if (!numericColumn) {
      return {
        success: false,
        answer:
          "Please include the numeric column you want to check.",
      };
    }

    const validRows = filteredRows
      .map((row) => ({
        row,
        value: parseNumber(row[numericColumn]),
      }))
      .filter((item) => item.value !== null)
      .sort((a, b) => b.value - a.value);

    if (validRows.length === 0) {
      return {
        success: false,
        answer: `No numeric values were found in "${numericColumn}".`,
      };
    }

    const highest = validRows[0];

    const labelColumn =
      columns.find((column) =>
        /\b(farmer|municipality|province|crop|farm id|name)\b/.test(
          normalizeText(column)
        )
      ) || null;

    const label =
      labelColumn && highest.row[labelColumn]
        ? ` (${labelColumn}: ${highest.row[labelColumn]})`
        : "";

    return {
      success: true,
      operation: "maximum",
      column: numericColumn,
      value: highest.value,
      answer:
        `The highest ${numericColumn}${filterText} is ` +
        `${formatNumber(highest.value)}${label}.`,
    };
  }

  if (
    /\b(lowest|minimum|min|smallest|least)\b/.test(
      normalizedQuestion
    )
  ) {
    const numericColumn = findNumericColumn(
      rows,
      question,
      columns
    );

    if (!numericColumn) {
      return {
        success: false,
        answer:
          "Please include the numeric column you want to check.",
      };
    }

    const values = filteredRows
      .map((row) => parseNumber(row[numericColumn]))
      .filter((value) => value !== null);

    if (values.length === 0) {
      return {
        success: false,
        answer: `No numeric values were found in "${numericColumn}".`,
      };
    }

    const minimum = Math.min(...values);

    return {
      success: true,
      operation: "minimum",
      column: numericColumn,
      value: minimum,
      answer:
        `The lowest ${numericColumn}${filterText} is ` +
        `${formatNumber(minimum)}.`,
    };
  }

  if (
    /\b(average|avg|mean)\b/.test(normalizedQuestion)
  ) {
    const numericColumn = findNumericColumn(
      rows,
      question,
      columns
    );

    if (!numericColumn) {
      return {
        success: false,
        answer:
          'Please include a numeric column, such as "average Area (ha)".',
      };
    }

    const values = filteredRows
      .map((row) => parseNumber(row[numericColumn]))
      .filter((value) => value !== null);

    if (values.length === 0) {
      return {
        success: false,
        answer: `No numeric values were found in "${numericColumn}".`,
      };
    }

    const average =
      values.reduce((sum, value) => sum + value, 0) /
      values.length;

    return {
      success: true,
      operation: "average",
      column: numericColumn,
      value: average,
      recordsUsed: values.length,
      answer:
        `The average ${numericColumn}${filterText} is ` +
        `${formatNumber(average)}.`,
    };
  }

  if (
    /\b(sum|total|combined|overall)\b/.test(
      normalizedQuestion
    )
  ) {
    const numericColumn = findNumericColumn(
      rows,
      question,
      columns
    );

    if (numericColumn) {
      const values = filteredRows
        .map((row) => parseNumber(row[numericColumn]))
        .filter((value) => value !== null);

      if (values.length === 0) {
        return {
          success: false,
          answer: `No numeric values were found in "${numericColumn}".`,
        };
      }

      const total = values.reduce(
        (sum, value) => sum + value,
        0
      );

      return {
        success: true,
        operation: "sum",
        column: numericColumn,
        value: total,
        recordsUsed: values.length,
        answer:
          `The total ${numericColumn}${filterText} is ` +
          `${formatNumber(total)}.`,
      };
    }
  }

  if (
    /\b(unique|distinct)\b/.test(normalizedQuestion) &&
    selectedColumn
  ) {
    const uniqueValues = new Set(
      filteredRows
        .map((row) =>
          String(row[selectedColumn] ?? "").trim()
        )
        .filter(Boolean)
    );

    return {
      success: true,
      operation: "unique_count",
      column: selectedColumn,
      value: uniqueValues.size,
      answer:
        `There are ${formatNumber(uniqueValues.size)} unique ` +
        `${selectedColumn} value(s)${filterText}.`,
    };
  }

  if (
    selectedColumn &&
    /\b(breakdown|distribution|each|grouped|group|by)\b/.test(
      normalizedQuestion
    )
  ) {
    const counts = countByColumn(
      filteredRows,
      selectedColumn
    );

    if (counts.length === 0) {
      return {
        success: false,
        answer: `No values were found in "${selectedColumn}".`,
      };
    }

    const results = counts.slice(0, 10);

    const formatted = results
      .map(
        ([value, count], index) =>
          `${index + 1}. ${value}: ${formatNumber(count)}`
      )
      .join("\n");

    return {
      success: true,
      operation: "group_count",
      column: selectedColumn,
      results,
      answer:
        `Record count by ${selectedColumn}${filterText}:\n` +
        formatted,
    };
  }

  if (
    /\b(how many|number of|count|records|farms|farmers)\b/.test(
      normalizedQuestion
    )
  ) {
    if (
      selectedColumn &&
      /\b(farmer|farm id|id)\b/.test(
        normalizeText(selectedColumn)
      )
    ) {
      const uniqueValues = new Set(
        filteredRows
          .map((row) =>
            String(row[selectedColumn] ?? "").trim()
          )
          .filter(Boolean)
      );

      return {
        success: true,
        operation: "unique_count",
        column: selectedColumn,
        value: uniqueValues.size,
        answer:
          `There are ${formatNumber(uniqueValues.size)} unique ` +
          `${selectedColumn} value(s)${filterText}.`,
      };
    }

    return {
      success: true,
      operation: "row_count",
      value: filteredRows.length,
      answer:
        `There are ${formatNumber(filteredRows.length)} ` +
        `record(s)${filterText}.`,
    };
  }

  if (filter && filteredRows.length > 0) {
    const preview = filteredRows
      .slice(0, 5)
      .map((row, index) => {
        const details = columns
          .slice(0, 6)
          .map(
            (column) =>
              `${column}: ${row[column] ?? ""}`
          )
          .join(", ");

        return `${index + 1}. ${details}`;
      })
      .join("\n");

    return {
      success: true,
      operation: "filtered_records",
      count: filteredRows.length,
      answer:
        `I found ${formatNumber(filteredRows.length)} record(s)` +
        `${filterText}.\n${preview}`,
    };
  }

  return {
    success: false,
    operation: "unknown",
    answer:
      "I could not determine the requested calculation. " +
      createHelpMessage(columns),
  };
}

module.exports = {
  answerQuestion,
};