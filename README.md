# OpenMW-TPWater
Stylized water shader for OpenMW based on the water from Twilight Princess

For development builds only (0.49)

# Installation
Place ``water_nm.png`` into ``OpenMW\resources\vfs\textures\omw``, make a backup of the original texture.

Place ``water.frag`` into ``OpenMW\resources\shaders\compatibility``, make a backup of the original file.

In-game, in the Options -> Video -> Water tab, enable ``Water Shader``, ``Refraction``, ``Sunlight Scattering``, ``Wobbly Shores``
![image](https://github.com/EpochWon/OpenMW-TPWater/assets/10932207/0d709c29-ebcf-4624-9865-211f0e3f9635)


You can customize some of the shader settings by editing ``water.frag``, tweakables are at the top of the file.

# Preview
All preview images use my BloomKawase post process shader available here: https://github.com/EpochWon/OpenMW-PostProcessShaders

![screenshot069](https://github.com/EpochWon/OpenMW-TPWater/assets/10932207/1a528e6c-6a7f-47d9-96ee-2abb63fb9b7d)
![screenshot070](https://github.com/EpochWon/OpenMW-TPWater/assets/10932207/a487c851-9ff2-4503-8dca-7f07bb3b13a9)
![screenshot071](https://github.com/EpochWon/OpenMW-TPWater/assets/10932207/951c9995-1aa2-453c-a949-0400ad8125dc)
![screenshot072](https://github.com/EpochWon/OpenMW-TPWater/assets/10932207/41638b74-aee6-4299-b574-d0aa3fd0f449)
![screenshot074](https://github.com/EpochWon/OpenMW-TPWater/assets/10932207/c9dc4ff6-1b09-4cd3-a6e9-86d494c6e18f)

# Some Notes
This is not completely accurate to TP since TP uses custom authored mip maps to make the water fade out look nicer, along with using channel packed alpha, which I can't do without changing the texture sampler in the engine code. I also took some liberties with adding reflections and the way fade out is handled, because relying entirely on mips doesn't look very good for the large bodies of water in Morrowind. 

Also you only need to enable all the water settings in-game because I am lazy and did not hook up the ``#if``s at all
