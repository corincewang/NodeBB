import * as db from '../database';
import * as user from '../user';


interface GroupsFunction {
    getUsersFromSet(set: string, fields?: string[]): Promise<any[]>;
    getUserGroups(uids: string[]): Promise<any>;
    getUserGroupsFromSet(set: string, uids: string[]): Promise<any[]>;
    getUserGroupMembership(set: string, uids: string[]): Promise<any[]>;
    isMemberOfGroups(uid: string, groupNames: string[]): Promise<boolean[]>;
    getUserInviteGroups(uid: string): Promise<any[]>;
    getGroupsData(groupName: string): Promise<any>;
    getNonPrivilegeGroups(set: string, start: number, end: number): Promise<any[]>;
    ownership: {
        isOwner(uid: string, groupName: string): Promise<boolean>;
    };
    ephemeralGroups: string[];
}





module.exports = function (Groups: GroupsFunction) {
    Groups.getUsersFromSet = async function (set: string, fields: string[]) {
        const uids: string[] = await db.getSetMembers(set);

        if (fields) {
            return await user.getUsersFields(uids, fields);
        }
        return await user.getUsersData(uids);
    };

    Groups.getUserGroups = async function (uids: string[]) {
        return await Groups.getUserGroupsFromSet('groups:visible:createtime', uids);
    };

    Groups.getUserGroupsFromSet = async function (set: string, uids: string[]) {
        const memberOf: any[] = await Groups.getUserGroupMembership(set, uids);
        return await Promise.all(memberOf.map(memberOf => Groups.getGroupsData(memberOf)));
    };

    Groups.getUserGroupMembership = async function (set: string, uids: string[]) {
        const groupNames: string[] = await db.getSortedSetRevRange(set, 0, -1);
        return await Promise.all(uids.map(uid => findUserGroups(uid, groupNames)));
    };

    async function findUserGroups(uid: string, groupNames: string[]) {
        const isMembers: boolean[] = await Groups.isMemberOfGroups(uid, groupNames);
        return groupNames.filter((name, i) => isMembers[i]);
    }

    Groups.getUserInviteGroups = async function (uid: string) {
        let allGroups: any[] = await Groups.getNonPrivilegeGroups('groups:createtime', 0, -1);
        allGroups = allGroups.filter((group: any) => !Groups.ephemeralGroups.includes(group.name));

        const publicGroups: any[] = allGroups.filter((group: any) => group.hidden === 0 && group.system === 0 && group.private === 0);
        const adminModGroups: any[] = [
            { name: 'administrators', displayName: 'administrators' },
            { name: 'Global Moderators', displayName: 'Global Moderators' },
        ];
        // Private (but not hidden)
        const privateGroups: any[] = allGroups.filter((group: any) => group.hidden === 0 &&
            group.system === 0 && group.private === 1);

        const [ownership, isAdmin, isGlobalMod] = await Promise.all([
            Promise.all(privateGroups.map((group: any) => Groups.ownership.isOwner(uid, group.name))),
            user.isAdministrator(uid),
            user.isGlobalModerator(uid),
        ]);
        const ownGroups: any[] = privateGroups.filter((group: any[], index) => ownership[index]);

        let inviteGroups: any[] = [];
        if (isAdmin) {
            inviteGroups = inviteGroups.concat(adminModGroups).concat(privateGroups);
        } else if (isGlobalMod) {
            inviteGroups = inviteGroups.concat(privateGroups);
        } else {
            inviteGroups = inviteGroups.concat(ownGroups);
        }

        return inviteGroups
            .concat(publicGroups);
    }
};