import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import type { MemberOption } from "@/types";

export function MemberPicker({ members, value, onChange, required = false, excludeId }: { members: MemberOption[]; value: string; onChange: (id: string) => void; required?: boolean; excludeId?: number }) {
  const { local } = useLanguage();
  const listId = useId();
  const labelFor = (member: MemberOption) => `${member.name}${member.name_en ? ` ${member.name_en}` : ""} · ${member.phone}`;
  const [query, setQuery] = useState("");
  const [matchedId, setMatchedId] = useState("");
  const emitted = useRef("");
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    const member = members.find((item) => String(item.id) === value);
    setMatchedId(value);
    setQuery(member ? labelFor(member) : "");
  }, [value, members]);
  // 会员上千后不再把整份名单塞进 datalist：按输入内容过滤，最多给 60 条候选。
  const suggestions = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const pool = keyword ? members.filter((member) => `${member.name} ${member.name_en ?? ""} ${member.phone}`.toLowerCase().includes(keyword)) : members;
    return pool.filter((member) => member.id !== excludeId).slice(0, 60);
  }, [members, query, excludeId]);
  return <>
    <input required={required && !matchedId} value={query} onChange={(event) => {
      setQuery(event.target.value);
      const match = members.find((member) => member.id !== excludeId && labelFor(member) === event.target.value);
      const nextId = match ? String(match.id) : "";
      emitted.current = nextId;
      setMatchedId(nextId);
      onChange(nextId);
    }} list={listId} placeholder={local("输入姓名或手机号检索", "Search by name or mobile number")} autoComplete="off"/>
    <datalist id={listId}>{suggestions.map((member) => <option key={member.id} value={labelFor(member)}>{local("会员", "Member")} #{member.id}</option>)}</datalist>
  </>;
}
