module.exports = {

  apps: [

    {

      name: "tradeflow",

      script: "npm",

      args: "start",

      instances: 5,

      exec_mode: "cluster",

      env: {

        PORT: 8041,

        NODE_ENV: "production",

      },

    },

  ],

};
