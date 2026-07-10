import { LinkedInProfileApp } from "@/components/LinkedInProfileApp";
import { LINKEDIN_PROFILE_FIXTURE } from "@/data/linkedin-profile.fixture";
import { mapLinkedInProfile } from "@/lib/linkedin-profile";

export default function Home() {
  return <LinkedInProfileApp sample={mapLinkedInProfile(LINKEDIN_PROFILE_FIXTURE)} />;
}
