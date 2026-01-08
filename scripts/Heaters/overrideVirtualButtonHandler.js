Shelly.addEventHandler(function(e) {
  if (e.component === "button:200") {
      let user_data = {
        current_status : null,
      }
      Shelly.call("Boolean.GetStatus", {"id":"200"},
        function (response, error_code, error_message) {
          if(error_code != 0){
            console.log("Error getting current status");
            return;
          }
          user_data.current_status = response.value;
          Shelly.call("Boolean.Set", {"id":"200", "value": !user_data.current_status},
            function (response, error_code, error_message) {
              if(error_code != 0){
                console.log("Error setting new status to " + !user_data.current_status);
                return;
              }
            }
          )
        }
      )
  }
});