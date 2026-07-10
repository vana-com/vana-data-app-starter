import type { LinkedInSnapshot } from "@/lib/linkedin-profile";
import type { ReactNode } from "react";

export function ProfileSnapshot({ profile }: { profile: LinkedInSnapshot }) {
  const initials = profile.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <article className="snapshot" aria-label={`${profile.name} LinkedIn profile snapshot`}>
      <header className="profile-header">
        <div className="avatar" aria-hidden="true">{initials}</div>
        <div>
          <h1>{profile.name}</h1>
          {profile.headline ? <p className="headline">{profile.headline}</p> : null}
        </div>
      </header>

      <ProfileSection title="Work">
        {profile.work.length > 0 ? (
          <ol className="timeline">
            {profile.work.map((item, index) => (
              <li key={`${item.title}-${item.company}-${index}`}>
                <div>
                  <strong>{item.title || "Role"}</strong>
                  {item.company ? <span>{item.company}</span> : null}
                </div>
                {item.period ? <time>{item.period}</time> : null}
              </li>
            ))}
          </ol>
        ) : <EmptySection />}
      </ProfileSection>

      <ProfileSection title="Education">
        {profile.education.length > 0 ? (
          <ol className="timeline">
            {profile.education.map((item, index) => (
              <li key={`${item.school}-${item.degree}-${index}`}>
                <div>
                  <strong>{item.school || "Education"}</strong>
                  {item.degree ? <span>{item.degree}</span> : null}
                </div>
                {item.period ? <time>{item.period}</time> : null}
              </li>
            ))}
          </ol>
        ) : <EmptySection />}
      </ProfileSection>

      <ProfileSection title="Skills">
        {profile.skills.length > 0 ? (
          <ul className="skills">
            {profile.skills.map((skill, index) => <li key={`${skill}-${index}`}>{skill}</li>)}
          </ul>
        ) : <EmptySection />}
      </ProfileSection>
    </article>
  );
}

function ProfileSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="profile-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function EmptySection() {
  return <p className="empty-section">No profile entries provided.</p>;
}
