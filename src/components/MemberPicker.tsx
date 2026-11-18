import { useEffect, useId, useRef, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import type { Member } from "@/types";

export function MemberPicker({ members, value, onChange, required = false, excludeId }: { members: Member[]; value: string; onChange: (id: string) => void; required?: boolean; excludeId?: number }) {
  const { local } = useLanguage();
  const listId = useId();
  const labelFor = (member: Member) => `${member.name}${member.name_en ? ` ${member.name_en}` : ""} · ${member.phone}`;
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
  return <>
    <input required={required && !matchedId} value={query} onChange={(event) => {
      setQuery(event.target.value);
      const match = members.find((member) => member.id !== excludeId && labelFor(member) === event.target.value);
      const nextId = match ? String(match.id) : "";
      emitted.current = nextId;
      setMatchedId(nextId);
      onChange(nextId);
    }} list={listId} placeholder={local("输入姓名或手机号检索", "Search by name or mobile number")} autoComplete="off"/>
    <datalist id={listId}>{members.filter((member) => member.id !== excludeId).map((member) => <option key={member.id} value={labelFor(member)}>{local("会员", "Member")} #{member.id}</option>)}</datalist>
  </>;
}
