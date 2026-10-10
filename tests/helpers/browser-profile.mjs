export function browserLaunchProfile(engine,platform=process.platform){
  if(!['chromium','firefox','webkit'].includes(engine))throw Error('Unknown browser profile');
  return engine==='firefox'&&platform==='linux'
    ?{headless:false,firefoxUserPrefs:{'webgl.force-enabled':true}}
    :{headless:true,firefoxUserPrefs:{}};
}
export function linuxFirefoxEnvironment(env=process.env){
  if(env.LIBGL_ALWAYS_SOFTWARE!=='true'||env.GALLIUM_DRIVER!=='llvmpipe'||!/^:\d+(?:\.\d+)?$/.test(env.DISPLAY||''))throw Error('Linux Firefox requires owned Xvfb display and native Mesa software environment');
  return {display:env.DISPLAY,softwareEnvironment:{LIBGL_ALWAYS_SOFTWARE:env.LIBGL_ALWAYS_SOFTWARE,GALLIUM_DRIVER:env.GALLIUM_DRIVER}};
}

export function chromiumDiagnostic(platform=process.platform,env=process.env){
  if(!Object.hasOwn(env,'JUST_SNAKE_CHROMIUM_DIAGNOSTIC'))return null;
  if(env.JUST_SNAKE_CHROMIUM_DIAGNOSTIC!=='mac-metal'||platform!=='darwin')throw Error('Chromium Metal diagnostic requires exact mac-metal control on native macOS');
  return 'mac-metal';
}
export function chromiumLaunchArgs(platform=process.platform,env=process.env){
  return chromiumDiagnostic(platform,env)
    ?['--use-cmd-decoder=passthrough','--use-gl=angle','--use-angle=metal']
    :['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'];
}
