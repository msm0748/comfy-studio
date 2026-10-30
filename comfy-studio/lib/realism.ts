// Cues that steer away from the polished "AI look" (waxy skin, HDR colors, CGI motion, quantized vocals).
// Applied to the English prompt after translation. Distilled models here run at CFG 1, so negatives are
// ignored and every cue is phrased positively. Stylized requests keep their medium untouched.
const STYLIZED=/\b(illustrat\w*|anime|manga|cartoon\w*|comic|painting|painted|watercolou?r|oil paint\w*|sketch\w*|drawing|drawn|line ?art|pixel ?art|vector|logo|icon|emoji|3d render\w*|cgi|clay\w*|low ?poly|isometric|infographic|chibi|vaporwave|surreal\w*|fantasy art|concept art)\b/i;
export const isStylized=(prompt:string)=>STYLIZED.test(prompt);
const join=(prompt:string,cue:string)=>prompt.replace(/[\s.,;]+$/,'')+'. '+cue;

export const IMAGE_REALISM='Authentic candid photograph, unretouched, realistic skin texture with visible pores and fine imperfections, natural available light, true-to-life muted colors, subtle film grain, natural depth of field.';
export function withImageRealism(prompt:string):string{return isStylized(prompt)?prompt:join(prompt,IMAGE_REALISM);}

export const VIDEO_REALISM='Looks like real live-action camera footage: natural unhurried motion with physically plausible weight, subtle handheld camera movement, natural motion blur, natural lighting, true-to-life colors, real skin texture, subtle film grain.';
export function withVideoRealism(prompt:string):string{return isStylized(prompt)?prompt:join(prompt,VIDEO_REALISM);}

// ACE-Step reads tags as a caption; genre-neutral cues avoid conflicting styles, which degrade output.
export function withMusicRealism(style:string,mode:'vocal'|'instrumental'):string{
 return style.replace(/[\s.,;]+$/,'')+', organic human performance, natural dynamics, warm analog mix, natural room ambience'+(mode==='vocal'?', natural expressive vocal with audible breaths':'');
}
