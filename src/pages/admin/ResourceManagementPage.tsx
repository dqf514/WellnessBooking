import { PageHeader } from "@/components/AdminUI";
import { useLanguage } from "@/context/LanguageContext";
import { CatalogSettings } from "./settings/CatalogSettings";

export function ResourceManagementPage({ kind }: { kind: "rooms" | "teachers" }) {
  const { local } = useLanguage();
  const rooms = kind === "rooms";
  return <div><PageHeader eyebrow={rooms ? "SPACE RESOURCES" : "INSTRUCTOR RESOURCES"} title={local(rooms ? "教室管理" : "教练管理", rooms ? "Room management" : "Instructor management")} description={local(rooms ? "独立维护教室资料、楼层、容量、排序和启停状态；删除后可在回收站恢复。" : "独立维护教练资料、照片、专长和展示状态；删除后可在回收站恢复。", rooms ? "Manage rooms, floors, capacity, ordering and availability. Deleted items can be restored from the recycle bin." : "Manage instructor profiles, portraits, specialties and visibility. Deleted items can be restored from the recycle bin.")}/><CatalogSettings kind={kind}/></div>;
}
