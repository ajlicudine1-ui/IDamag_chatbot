const conversations = new Map();

const MAX_HISTORY = 10;

/**
 * Create a fresh conversation state.
 */
function createEmptyContext() {
  return {
    lastEntity: null,
    lastDataset: null,
    lastIntent: null,
    lastMetric: null,
    lastFilters: [],
    lastPlan: null,
    lastResult: null,
    history: [],
  };
}

/**
 * Get conversation state.
 */
function getConversation(sessionId = "default") {
  if (!conversations.has(sessionId)) {
    conversations.set(
      sessionId,
      createEmptyContext()
    );
  }

  return conversations.get(sessionId);
}

/**
 * Determine whether a question depends on
 * something previously discussed.
 */
function isFollowUpQuestion(question) {
  const text = String(question || "")
    .toLowerCase()
    .trim();

  if (!text) {
    return false;
  }

  const patterns = [
    /^how about\b/i,
    /^what about\b/i,
    /^and\b/i,
    /^also\b/i,
    /^then\b/i,

    /\bhis\b/i,
    /\bher\b/i,
    /\btheir\b/i,
    /\bits\b/i,

    /\bhim\b/i,
    /\bthem\b/i,

    /\bthat person\b/i,
    /\bthat farmer\b/i,
    /\bthat association\b/i,
    /\bthat municipality\b/i,
    /\bthat province\b/i,

    /\bthe same\b/i,
    /\bsame one\b/i,

    /^what(?:'s| is) the total\b/i,
    /^what(?:'s| is) the average\b/i,
    /^what(?:'s| is) the highest\b/i,
    /^what(?:'s| is) the lowest\b/i,

    /^what about the total\b/i,
    /^how about the total\b/i,
  ];

  return patterns.some(
    (pattern) => pattern.test(text)
  );
}

/**
 * Extract the most useful entity/filter
 * from a query plan.
 *
 * Groq uses filters like:
 *
 * [
 *   {
 *     column: "Farmer",
 *     operator: "equals",
 *     value: "Aaron"
 *   }
 * ]
 */
function extractPrimaryEntity(filters) {
  if (!Array.isArray(filters)) {
    return null;
  }

  /**
   * Prefer equality because this usually
   * identifies a specific entity.
   */
  const equalityFilter =
    filters.find(
      (filter) =>
        filter &&
        filter.column &&
        filter.value !== undefined &&
        filter.value !== null &&
        String(
          filter.operator || "equals"
        ).toLowerCase() === "equals"
    );

  if (equalityFilter) {
    return {
      column:
        equalityFilter.column,

      value:
        equalityFilter.value,

      operator:
        equalityFilter.operator ||
        "equals",
    };
  }

  /**
   * Otherwise use the first valid filter.
   */
  const firstFilter =
    filters.find(
      (filter) =>
        filter &&
        filter.column &&
        filter.value !== undefined &&
        filter.value !== null
    );

  if (!firstFilter) {
    return null;
  }

  return {
    column:
      firstFilter.column,

    value:
      firstFilter.value,

    operator:
      firstFilter.operator ||
      "equals",
  };
}

/**
 * Determine the metric/output field from
 * a structured query plan.
 */
function extractMetric(plan) {
  if (!plan) {
    return null;
  }

  if (plan.column) {
    return plan.column;
  }

  if (
    Array.isArray(
      plan.selectColumns
    ) &&
    plan.selectColumns.length
  ) {
    /**
     * Keep all requested fields.
     *
     * This is useful for follow-ups after:
     *
     * "show farmer and municipality"
     */
    return [
      ...plan.selectColumns,
    ];
  }

  if (plan.groupBy) {
    return plan.groupBy;
  }

  return null;
}

/**
 * Update conversation after a successfully
 * planned/executed question.
 */
function updateConversation(
  sessionId = "default",
  {
    question = null,
    plan = null,
    result = null,
  } = {}
) {
  const context =
    getConversation(sessionId);

  if (plan) {
    if (plan.dataset) {
      context.lastDataset =
        plan.dataset;
    }

    if (plan.operation) {
      context.lastIntent =
        plan.operation;
    } else if (plan.intent) {
      context.lastIntent =
        plan.intent;
    }

    const metric =
      extractMetric(plan);

    if (metric) {
      context.lastMetric =
        metric;
    }

    /**
     * IMPORTANT:
     * filters in your current Groq plan
     * are ARRAYS.
     */
    if (
      Array.isArray(plan.filters)
    ) {
      context.lastFilters =
        plan.filters.map(
          (filter) => ({
            ...filter,
          })
        );

      const entity =
        extractPrimaryEntity(
          plan.filters
        );

      if (entity) {
        context.lastEntity =
          entity;
      }
    }

    context.lastPlan = {
      ...plan,
    };
  }

  if (result !== undefined) {
    context.lastResult =
      result;
  }

  if (question) {
    context.history.push({
      question,
      plan,
      result,
      timestamp:
        Date.now(),
    });

    if (
      context.history.length >
      MAX_HISTORY
    ) {
      context.history =
        context.history.slice(
          -MAX_HISTORY
        );
    }
  }

  return context;
}

/**
 * Get context that may be useful for
 * interpreting the next question.
 */
function getRelevantContext(
  sessionId = "default",
  question
) {
  const context =
    getConversation(sessionId);

  const isFollowUp =
    isFollowUpQuestion(question);

  /**
   * We return previous information even
   * for a normal question so the planner
   * can see it if needed.
   *
   * But isFollowUp explicitly tells Groq
   * whether it is allowed to inherit
   * previous meaning.
   */
  return {
    isFollowUp,

    lastEntity:
      context.lastEntity,

    lastDataset:
      context.lastDataset,

    lastIntent:
      context.lastIntent,

    lastMetric:
      context.lastMetric,

    lastFilters:
      context.lastFilters,

    lastPlan:
      isFollowUp
        ? context.lastPlan
        : null,

    lastResult:
      isFollowUp
        ? context.lastResult
        : null,
  };
}

/**
 * Get recent conversation history.
 */
function getHistory(
  sessionId = "default"
) {
  const context =
    getConversation(sessionId);

  return [
    ...context.history,
  ];
}

/**
 * Clear one conversation.
 */
function clearConversation(
  sessionId = "default"
) {
  conversations.delete(
    sessionId
  );
}

/**
 * Clear every conversation.
 */
function clearAllConversations() {
  conversations.clear();
}

module.exports = {
  getConversation,
  updateConversation,
  getRelevantContext,
  getHistory,
  isFollowUpQuestion,
  clearConversation,
  clearAllConversations,
};