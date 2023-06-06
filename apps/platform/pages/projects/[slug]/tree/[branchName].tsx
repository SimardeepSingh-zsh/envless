import type { Redirect } from "next";
import { generateKey } from "@47ng/cloak";
import { getServerSideSession } from "@/utils/session";
import { withAccessControl } from "@/utils/withAccessControl";
import {
  type Branch,
  MembershipStatus,
  type Project,
  User,
  UserRole,
} from "@prisma/client";
import { ProjectCommon } from "@/components/projects/ProjectCommon";
import OpenPGP from "@/lib/encryption/openpgp";
import prisma from "@/lib/prisma";

/**
 * A functional component that represents a project.
 * @param {Props} props - The props for the component.
 * @param {Projects} props.projects - The projects the user has access to.
 * @param {currentProject} props.currentProject - The current project.
 * @param {currentRole} props.currentRole - The user role in current project.
 */
interface Props {
  user: User;
  projects: Project[];
  currentProject: Project;
  currentRole: UserRole;
  branches: Branch[];
  currentBranch: Branch;
}

export const ProjectBranchPage = ({
  user,
  projects,
  currentProject,
  currentRole,
  branches,
  currentBranch,
}: Props) => {
  return (
    <ProjectCommon
      user={user}
      projects={projects}
      currentProject={currentProject}
      currentRole={currentRole}
      branches={branches}
      currentBranch={currentBranch}
    />
  );
};

export const getServerSideProps = withAccessControl({
  withEncryptedProjectKey: true,
  hasAccess: {
    roles: [
      UserRole.maintainer,
      UserRole.developer,
      UserRole.guest,
      UserRole.owner,
    ],
    statuses: [MembershipStatus.active],
  },
  getServerSideProps: async (context) => {
    let redirect: null | Redirect = null; // Force redirect when the getServerSideProps that next sees get called.

    const session = await getServerSideSession(context);
    const user = session?.user;
    // @ts-ignore
    const { slug, branchName } = context.params;

    const currentProject = await prisma.project.findFirst({
      where: { slug: slug as string },
      select: {
        id: true,
        encryptedProjectKey: {
          select: { id: true, encryptedKey: true },
        },
        branches: {
          select: {
            id: true,
            name: true,
            protected: true,
          },
        },
      },
    });

    const keychain = await prisma.keychain.findFirst({
      where: { userId: user?.id },
      select: { publicKey: true },
    });

    const { publicKey } = keychain as { publicKey: string };
    const encryptedProjectKey = currentProject?.encryptedProjectKey;
    const branches = currentProject?.branches;
    const currentBranch = branches?.find(
      (branch) => branch.name === branchName,
    );

    if (!currentBranch) {
      redirect = {
        destination: `/projects/${slug}`,
        permanent: false,
      };
    }

    if (publicKey && !encryptedProjectKey) {
      const decryptedProjectKey = generateKey();

      const encryptedKey = (await OpenPGP.encrypt(decryptedProjectKey, [
        publicKey,
      ])) as string;

      await prisma.encryptedProjectKey.create({
        data: {
          encryptedKey,
          projectId: currentProject?.id as string,
        },
      });
    }

    return {
      props: {
        branches,
        currentBranch,
        redirect,
      },
    };
  },
});

export default ProjectBranchPage;
