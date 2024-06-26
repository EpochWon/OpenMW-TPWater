#version 130

#if @useUBO
    #extension GL_ARB_uniform_buffer_object : require
#endif

#if @useGPUShader4
    #extension GL_EXT_gpu_shader4: require
#endif

#include "lib/core/fragment.h.glsl"

// tweakables -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --

const float TILE_SIZE = 1200.0;

const float PAN_SPEED_X = 0.0;
const float PAN_SPEED_Y = 0.05;

const vec2 DISTORTION_SCALE = vec2(0.007, 0.005);
const vec2 SPECULAR_DISTORTION_SCALE = vec2(0.007, 0.005);
const vec2 UNDERWATER_DISTORTION_SCALE = vec2(0.028, 0.02);

const float BRIGHTNESS = 0.975;
const float SPECULAR_INTENSITY = 0.5;
const vec3 UNDERWATER_TINT = vec3(0.9);

const float FADE_POW = 0.8;
const float MIP_BIAS = 0; // global mip bias, affects water surface and WATER_FOG, WATER_FOG has its own mip bias that is applied after

const float SHORE_SIZE = 25.0; // size of depth based shore effect

const float SUN_SPEC_FADING_THRESHOLD = 0.35; // visibility at which sun specularity starts to fade

// enable water fogging
#define WATER_FOG 1

// enable reflections
#define REFLECTION 1

// whether or not to disable fake specular highlights when in an interior
#define DISABLE_SPEC_INTERIOR 1


#if WATER_FOG
const float FADE_DIST = -3; // mip bias for water fade
#endif

// -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -

vec2 uvPanner(vec2 uv, float xSpeed, float ySpeed, float time) {
    return vec2(uv.x + time * xSpeed, uv.y + time * ySpeed);
}

vec2 uvDistort(vec2 uv, vec3 distortionTexture, vec2 distortionVector) {
    vec2 distortion = (distortionTexture.xy - 1.0 / 2.0) * distortionVector;
    return uv + distortion;
}

uniform sampler2D rippleMap;
uniform vec3 playerPos;

varying vec3 worldPos;

varying vec2 rippleMapUV;

varying vec4 position;
varying float linearDepth;

uniform sampler2D normalMap;

uniform float osg_SimulationTime;

uniform float near;
uniform float far;

uniform float rainIntensity;
uniform bool enableRainRipples;

uniform vec2 screenRes;

uniform mat4 osg_ViewMatrixInverse;

#define PER_PIXEL_LIGHTING 0

#include "shadows_fragment.glsl"
#include "lib/light/lighting.glsl"
#include "fog.glsl"
#include "lib/water/fresnel.glsl"
#include "lib/water/rain_ripples.glsl"
#include "lib/view/depth.glsl"

float mip_map_level(in vec2 texture_coordinate)
{
    // The OpenGL Graphics System: A Specification 4.2
    //  - chapter 3.9.11, equation 3.21
    vec2  dx_vtc        = dFdx(texture_coordinate);
    vec2  dy_vtc        = dFdy(texture_coordinate);
    float delta_max_sqr = max(dot(dx_vtc, dx_vtc), dot(dy_vtc, dy_vtc));
    //return 0.5 * log2(delta_max_sqr * (screenRes.y / 480));
    return 0.5 * log2(delta_max_sqr);
}

void main(void)
{
    vec2 UV = worldPos.xy / TILE_SIZE;
    float shadow = unshadowedLightRatio(linearDepth);
    vec2 screenCoords = gl_FragCoord.xy / screenRes;

    float mipmapLevel = 0.0;
    mipmapLevel = mip_map_level(worldPos.xy);
    mipmapLevel += MIP_BIAS;

    #define waterTimer osg_SimulationTime

    vec3 sunWorldDir = normalize((gl_ModelViewMatrixInverse * vec4(lcalcPosition(0).xyz, 0.0)).xyz);
    vec3 cameraPos = (gl_ModelViewMatrixInverse * vec4(0,0,0,1)).xyz;
    vec3 viewDir = normalize(position.xyz - cameraPos.xyz);

    // fresnel
    float ior = 1.333/1.0;
    float fresnel = clamp(fresnel_dielectric(viewDir, vec3(0.0, 0.0, 1.0), ior), 0.0, 1.0);

    // shore depth
    vec2 screenCoordsOffset = vec2(0.0);

    float depthSample = linearizeDepth(sampleRefractionDepthMap(screenCoords), near, far);
    float surfaceDepth = linearizeDepth(gl_FragCoord.z, near, far);
    float realWaterDepth = depthSample - surfaceDepth;  // undistorted water depth in view direction, independent of frustum
    float depthSampleDistorted = linearizeDepth(sampleRefractionDepthMap(screenCoords - screenCoordsOffset), near, far);
    float waterDepthDistorted = max(depthSampleDistorted - surfaceDepth, 0.0);

    // ripples
    vec4 rainRipple = vec4(0.0);

    if (rainIntensity > 0.01 && enableRainRipples)
        rainRipple = rainCombined(position.xy/1000.0, waterTimer) * clamp(rainIntensity, 0.0, 1.0);
    else
        rainRipple = vec4(0.0);

    vec3 rippleAdd = rainRipple.xyz * 10.0;

    float distToCenter = length(rippleMapUV - vec2(0.5));
    float blendClose = smoothstep(0.001, 0.02, distToCenter);
    float blendFar = 1.0 - smoothstep(0.3, 0.4, distToCenter);
    float distortionLevel = 1.0;
    rippleAdd += distortionLevel * vec3(texture2D(rippleMap, rippleMapUV).ba * blendFar * blendClose, 0.0);

    // water surface
    vec4 tex0 = texture2D(normalMap, uvPanner(UV, PAN_SPEED_X, PAN_SPEED_Y, waterTimer)) + vec4(rippleAdd, 1.0);
    vec4 tex1 = textureLod(normalMap, uvDistort(uvPanner(UV + 0.65, 0.0, -0.00625, waterTimer), tex0.rgb, DISTORTION_SCALE + rainIntensity / 25), mipmapLevel + 0) + vec4(rippleAdd, 1.0);

    vec4 tex2 = texture2D(normalMap, uvPanner(UV, PAN_SPEED_X, PAN_SPEED_Y * -1.0, waterTimer)) + vec4(rippleAdd, 1.0);
    vec4 tex3 = textureLod(normalMap, uvDistort(uvPanner(UV + 0.2, 0.0, 0.00625, waterTimer), tex2.rgb, DISTORTION_SCALE + rainIntensity / 25), mipmapLevel + 0) + vec4(rippleAdd, 1.0);

    vec4 layer1 = (tex1 + tex3) / 2.0;

    vec4 tex4 = texture2D(normalMap, uvPanner(UV, PAN_SPEED_X, PAN_SPEED_Y, waterTimer)) + vec4(rippleAdd, 1.0);
    vec4 tex5 = textureLod(normalMap, uvDistort(uvPanner(UV + 0.65, 0.0, -0.00625, waterTimer), tex4.rgb, DISTORTION_SCALE + rainIntensity / 25), mipmapLevel + 1) + vec4(rippleAdd, 1.0);

    vec4 tex6 = texture2D(normalMap, uvPanner(UV, PAN_SPEED_X, PAN_SPEED_Y * -1.0, waterTimer)) + vec4(rippleAdd, 1.0);
    vec4 tex7 = textureLod(normalMap, uvDistort(uvPanner(UV + 0.2, 0.0, 0.00625, waterTimer), tex6.rgb, DISTORTION_SCALE + rainIntensity / 25), mipmapLevel + 1) + vec4(rippleAdd, 1.0);

    vec4 layer2 = (tex5 + tex7) / 2.0;

    // specular highlights

    // Extremely silly hack to determine whether we're indoors or not - from Zesterer
	vec3 sunPos = lcalcPosition(0);
	vec3 sunDir = normalize(sunPos);
	vec3 sunWDir = (osg_ViewMatrixInverse * vec4(sunDir, 0.0)).xyz;
	float isInterior = step(0.0, sunWDir.y);

    vec4 spec0 = texture2D(normalMap, uvPanner(UV, PAN_SPEED_X, PAN_SPEED_Y, waterTimer)) + vec4(rippleAdd, 1.0);
    vec4 spec1 = textureLod(normalMap, uvDistort(uvPanner(UV + 0.634, 0.0, -0.00625, waterTimer), spec0.rgb, SPECULAR_DISTORTION_SCALE), mipmapLevel + 0) + vec4(rippleAdd, 1.0);

    vec4 spec2 = texture2D(normalMap, uvPanner(UV, PAN_SPEED_X, PAN_SPEED_Y * -1.0, waterTimer)) + vec4(rippleAdd, 1.0);
    vec4 spec3 = textureLod(normalMap, uvDistort(uvPanner(UV + 0.152, 0.0, 0.00625, waterTimer), spec2.rgb, SPECULAR_DISTORTION_SCALE), mipmapLevel + 0) + vec4(rippleAdd, 1.0);

    float specular = (spec1.b + spec3.b);
    if (specular > 1.0)
        specular = 0.0;
    vec4 sunSpec = lcalcSpecular(0);
    specular *= SPECULAR_INTENSITY * min(1.0, sunSpec.a / SUN_SPEC_FADING_THRESHOLD);
#if DISABLE_SPEC_INTERIOR
    if (isInterior == 1.0)
        specular = 0.0;
#endif

    // combine surface
    float base = ((layer1.b + layer2.b) / 2.0);
    base -= max(rippleAdd.r, rippleAdd.g);
    base -= pow(fresnel, FADE_POW);
    base -= clamp(1.0 - waterDepthDistorted / SHORE_SIZE, 0.0, 1.0);
    base = smoothstep(0.75, 0.75, base);
    base *=  base;
    base = (base + BRIGHTNESS) * 0.5;

    // refraction
    vec4 refractionTex0 = texture2D(normalMap, uvPanner(UV, PAN_SPEED_X / 2.0, PAN_SPEED_Y / 2.0, waterTimer)) + vec4(rippleAdd, 1.0);
    vec4 refractionTex1 = texture2D(normalMap, uvPanner(UV, PAN_SPEED_X / 2.0, (PAN_SPEED_Y * -1) / 2.0, waterTimer)) + vec4(rippleAdd, 1.0);

    vec3 unRefracted = sampleRefractionMap(screenCoords - screenCoordsOffset).rgb;
    vec3 refracted = sampleRefractionMap(uvDistort(screenCoords - screenCoordsOffset, (refractionTex0.rgb + refractionTex1.rgb) / 2.0, UNDERWATER_DISTORTION_SCALE)).rgb;
    vec3 refraction = mix(unRefracted, refracted, clamp(min(waterDepthDistorted / 10.0, 1.0 - distToCenter), 0.0, 1.0));
    refraction *= UNDERWATER_TINT;
#if WATER_FOG
    refraction = mix(refraction, vec3(0.0), clamp(mipmapLevel + FADE_DIST, 0.0, 1.0));
#endif
    //refraction += clamp(1.0 - waterDepthDistorted, 0.0, 1.0);

    // reflection
    vec3 reflection = sampleReflectionMap(uvDistort(screenCoords + screenCoordsOffset, (refractionTex0.rgb + refractionTex1.rgb) / 2.0, UNDERWATER_DISTORTION_SCALE)).rgb;
    reflection *= clamp(distToCenter, 0.0, 1.0);

#if REFLECTION
    gl_FragData[0].rgb = mix((vec3(base) * refraction + specular), reflection, fresnel);
#else
    gl_FragData[0].rgb = vec3(base) * refraction + specular;
#endif
    //gl_FragData[0].rgb = mix(refraction, vec3(base.b), base.a);
    //gl_FragData[0].rgb = vec3(fract(mipmapLevel)) * 0.5 + 0.5;
    gl_FragData[0].a = 1.0;


#if @radialFog
    float radialDepth = distance(position.xyz, cameraPos);
#else
    float radialDepth = 0.0;
#endif

    gl_FragData[0] = applyFogAtDist(gl_FragData[0], radialDepth, linearDepth, far);

    gl_FragData[1].rgb = normalize(gl_NormalMatrix * vec3(0.0, 0.0, 1.0)) * 0.5 + 0.5;

    applyShadowDebugOverlay();
}
