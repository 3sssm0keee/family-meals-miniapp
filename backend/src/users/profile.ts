import { FileService } from '../file/file.service.js';
export function profile(user:{id:string;displayName:string;avatarKey?:string|null}) {
 const image=user.avatarKey ? new FileService().signed({familyId:'_avatars',id:user.avatarKey,mimeType:'image/jpeg',sizeBytes:0}) : null;
 return {id:user.id,displayName:user.displayName,avatar:image ? {fileId:image.fileId,url:image.url,expiresAt:image.expiresAt} : null};
}
