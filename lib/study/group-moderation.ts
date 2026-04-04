const PLACEHOLDER_GROUP_NAME_PATTERNS = [
  /^(?:study\s+group\s+)?asdf+(?:\s+group)?$/i,
  /^(?:study\s+group\s+)?qwerty(?:\s+group)?$/i,
  /^(?:study\s+group\s+)?lol+(?:\s+group)?$/i,
  /^(?:study\s+group\s+)?lmao+(?:\s+group)?$/i,
  /^(?:study\s+group\s+)?test(?:ing)?(?:\s+group)?$/i,
  /^(?:study\s+group\s+)?dummy(?:\s+group)?$/i,
  /^(?:study\s+group\s+)?temp(?:orary)?(?:\s+group)?$/i,
  /^(?:study\s+group\s+)?placeholder(?:\s+group)?$/i,
  /^(?:study\s+group\s+)?joke(?:\s+group)?$/i,
];

export function isPlaceholderStudyGroupName(name: string) {
  const normalized = name.trim();
  if (!normalized) return false;
  return PLACEHOLDER_GROUP_NAME_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function validateStudyGroupName(name: string): { valid: boolean; reason?: string } {
  const normalized = name.trim();

  if (!normalized) {
    return { valid: false, reason: "Group name is required." };
  }

  if (normalized.length < 3) {
    return { valid: false, reason: "Pick a clearer study group name." };
  }

  if (isPlaceholderStudyGroupName(normalized)) {
    return { valid: false, reason: "Choose a real study group name before creating it." };
  }

  return { valid: true };
}

export function shouldHidePlaceholderStudyGroup(group: {
  name: string;
  memberships: { id: string }[];
  linkedSets: { id: string }[];
}) {
  return (
    isPlaceholderStudyGroupName(group.name) &&
    group.memberships.length <= 1 &&
    group.linkedSets.length === 0
  );
}
