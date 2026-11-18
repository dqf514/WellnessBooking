export const genderCopy: Record<string, [string, string]> = {
  女: ["女", "Female"],
  男: ["男", "Male"],
  其他: ["其他", "Other"],
};

/** 会员性别统一取值，避免把“其他”误显示成“男”。 */
export function genderLabel(value: string, local: (zh: string, en?: string) => string) {
  const copy = genderCopy[value];
  return copy ? local(copy[0], copy[1]) : value || "";
}
