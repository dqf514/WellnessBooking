import { useLanguage } from "@/context/LanguageContext";
import { API_ENDPOINT_COUNT, API_VERSION, APP_RELEASE_DATE, APP_VERSION, changelogReleases, type ChangelogText } from "@/lib/changelog";

export function ChangelogSettings() {
  const { admin: a, local, language } = useLanguage();
  const text = (item: ChangelogText) => (language === "en" ? item.en : item.zh);
  return <section className="settings-section">
    <div className="panel changelog-version">
      <div><small>{a("当前版本")}</small><strong>v{APP_VERSION}</strong><span>{local(`发布于 ${APP_RELEASE_DATE}`, `Released on ${APP_RELEASE_DATE}`)}</span></div>
      <div><small>{a("接口版本")}</small><strong>{API_VERSION}</strong><span>{local(`${API_ENDPOINT_COUNT} 个后台接口`, `${API_ENDPOINT_COUNT} admin endpoints`)}</span></div>
      <div><small>{a("更新批次")}</small><strong>{changelogReleases.length}</strong><span>{a("按日期分界，列出每次更新的主要内容")}</span></div>
      <a className="button button-primary" href="/changelog-2026-11-18.html" target="_blank" rel="noreferrer">{a("查看完整图文更新说明")}</a>
    </div>
    <ol className="changelog-timeline">
      {changelogReleases.map((release) => <li key={`${release.date}-${release.version}-${release.title.zh}`}>
        <div className="changelog-marker"><strong>{release.date}</strong><span>v{release.version}</span></div>
        <div className="panel changelog-release">
          <h3>{text(release.title)}</h3>
          <p className="changelog-summary">{text(release.summary)}</p>
          {release.groups.map((group) => <div className="changelog-group" key={group.title.zh}>
            <h4>{text(group.title)}</h4>
            <ul>{group.points.map((point, index) => <li key={index}>{text(point)}</li>)}</ul>
          </div>)}
        </div>
      </li>)}
    </ol>
  </section>;
}
